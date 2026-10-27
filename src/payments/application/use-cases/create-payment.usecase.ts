import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { prefixedId } from '../../../shared/utils/id';
import { GetMerchantUseCase } from '../../../merchants/application/use-cases/get-merchant.usecase';
import { Merchant } from '../../../merchants/domain/entities/merchant.entity';
import { MERCHANT_CURRENCY } from '../../../merchants/domain/merchant-accounts';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { ReserveCardTokenUseCase } from '../../../vault/application/use-cases/reserve-card-token.usecase';
import {
  AUTHORIZATION_VALIDITY_MS,
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '../../domain/entities/payment.entity';
import { computeFee } from '../../domain/fees';
import { generateTxid } from '../../domain/pix/identifiers';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { PIX_RAIL } from '../../../rails/pix-rail';
import type { PixRail } from '../../../rails/pix-rail';
import { toPaymentResource } from '../payment-resource';
import { AuthorizeCardPaymentUseCase } from './authorize-card-payment.usecase';

export type CreatePaymentInput = {
  merchantId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  description?: string;
  metadata?: Record<string, unknown>;
  expiresInSeconds?: number; // Pix only
  card?: { token: string; installments?: number }; // credit card only
  capture?: boolean; // credit card only; default true
};

const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_KEY_LENGTH = 40;
const MAX_METADATA_VALUE_LENGTH = 500;

@Injectable()
export class CreatePaymentUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PIX_RAIL) private readonly pixRail: PixRail,
    private readonly getMerchant: GetMerchantUseCase,
    private readonly publishEvent: PublishEventUseCase,
    private readonly reserveCardToken: ReserveCardTokenUseCase,
    private readonly authorizeCard: AuthorizeCardPaymentUseCase,
  ) {}

  /**
   * Pix comes back pending (the payer pays later). A card is authorized,
   * and captured unless capture is false, before this returns.
   */
  async execute(input: CreatePaymentInput): Promise<Payment> {
    if (input.currency !== MERCHANT_CURRENCY) {
      throw new DomainError(
        'payments.unsupported_currency',
        `Only ${MERCHANT_CURRENCY} is supported (got ${input.currency}).`,
      );
    }
    const isCard = input.method === PaymentMethod.CREDIT_CARD;
    if (isCard !== Boolean(input.card)) {
      throw new DomainError(
        'payments.card_mismatch',
        isCard
          ? 'A credit card payment needs card.token (from POST /v1/tokens).'
          : `card is only accepted with method "${PaymentMethod.CREDIT_CARD}".`,
      );
    }
    const metadata = validMetadata(input.metadata ?? {});
    const merchant = await this.getMerchant.execute(input.merchantId);

    return isCard
      ? this.createCard(input, merchant, metadata)
      : this.createPix(input, merchant, metadata);
  }

  private async createPix(
    input: CreatePaymentInput,
    merchant: Merchant,
    metadata: Record<string, string>,
  ): Promise<Payment> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        (input.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000,
    );
    const txid = generateTxid();

    // Registered at the bank before our transaction: if the insert below
    // fails, the orphan charge simply expires there unpaid.
    const { copiaECola } = await this.pixRail.createCharge({
      txid,
      amount: input.amount,
      expiresAt,
      merchantName: merchant.name,
    });

    const payment = new Payment({
      id: prefixedId('pay'),
      merchantId: merchant.id,
      amount: input.amount,
      currency: input.currency,
      method: PaymentMethod.PIX,
      status: PaymentStatus.PENDING,
      description: input.description ?? null,
      metadata,
      fee: computeFee(input.amount, merchant.pixFeeBps),
      pix: { txid, copiaECola, endToEndId: null, paidAt: null },
      card: null,
      failureCode: null,
      amountRefunded: 0,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await this.uow.run(async () => {
      await this.payments.save(payment);
      await this.publishEvent.execute(
        merchant.id,
        EventTypes.PAYMENT_PENDING,
        toPaymentResource(payment),
        now,
      );
    });
    return payment;
  }

  private async createCard(
    input: CreatePaymentInput,
    merchant: Merchant,
    metadata: Record<string, string>,
  ): Promise<Payment> {
    const now = new Date();
    const id = prefixedId('pay');

    // Recorded as pending before the acquirer is called: if the process dies
    // while it answers, RecoverCardPaymentsUseCase finishes the payment.
    const payment = await this.uow.run(async () => {
      const card = await this.reserveCardToken.execute(
        merchant.id,
        input.card!.token,
        id,
      );
      const pending = new Payment({
        id,
        merchantId: merchant.id,
        amount: input.amount,
        currency: input.currency,
        method: PaymentMethod.CREDIT_CARD,
        status: PaymentStatus.PENDING,
        description: input.description ?? null,
        metadata,
        fee: computeFee(input.amount, merchant.cardFeeBps),
        pix: null,
        card: {
          tokenId: card.id,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.expMonth,
          expYear: card.expYear,
          installments: input.card!.installments ?? 1,
          capture: input.capture ?? true,
          authorizationId: null,
          authorizedAt: null,
          capturedAt: null,
        },
        failureCode: null,
        amountRefunded: 0,
        expiresAt: new Date(now.getTime() + AUTHORIZATION_VALIDITY_MS),
        createdAt: now,
        updatedAt: now,
      });
      await this.payments.save(pending);
      return pending;
    });

    return this.authorizeCard.execute(payment);
  }
}

function validMetadata(
  metadata: Record<string, unknown>,
): Record<string, string> {
  const entries = Object.entries(metadata);
  const invalid = (reason: string) =>
    new DomainError('payments.invalid_metadata', `metadata ${reason}.`);

  if (entries.length > MAX_METADATA_KEYS) {
    throw invalid(`accepts at most ${MAX_METADATA_KEYS} keys`);
  }
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAX_METADATA_KEY_LENGTH) {
      throw invalid(
        `keys must have 1 to ${MAX_METADATA_KEY_LENGTH} characters`,
      );
    }
    if (typeof value !== 'string' || value.length > MAX_METADATA_VALUE_LENGTH) {
      throw invalid(
        `values must be strings of at most ${MAX_METADATA_VALUE_LENGTH} characters`,
      );
    }
  }
  return metadata as Record<string, string>;
}
