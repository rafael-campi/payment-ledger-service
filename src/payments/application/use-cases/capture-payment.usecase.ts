import { Inject, Injectable } from '@nestjs/common';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { merchantAccounts } from '../../../merchants/domain/merchant-accounts';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { ACQUIRER_RAIL } from '../../../rails/acquirer-rail';
import type { AcquirerRail } from '../../../rails/acquirer-rail';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { ScheduleReceivablesUseCase } from '../../../settlement/application/use-cases/schedule-receivables.usecase';
import { nonZero } from '../ledger-entries';
import { toPaymentResource } from '../payment-resource';

@Injectable()
export class CapturePaymentUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(ACQUIRER_RAIL) private readonly acquirer: AcquirerRail,
    private readonly postLedger: PostLedgerTransactionUseCase,
    private readonly publishEvent: PublishEventUseCase,
    private readonly scheduleReceivables: ScheduleReceivablesUseCase,
  ) {}

  /** Idempotent. Only an authorized card payment can be captured. */
  async execute(merchantId: string, id: string): Promise<Payment> {
    return this.uow.run(async () => {
      const payment = await this.payments.lockById(merchantId, id);
      if (!payment) {
        throw new NotFoundError(
          'payments.not_found',
          `Payment ${id} does not exist.`,
        );
      }
      if (payment.status === PaymentStatus.SUCCEEDED && payment.card) {
        return payment;
      }
      if (payment.status !== PaymentStatus.AUTHORIZED) {
        throw new DomainError(
          'payments.not_capturable',
          `Payment ${id} is ${payment.status}; only authorized card payments can be captured.`,
        );
      }
      return this.captureLocked(payment);
    });
  }

  /**
   * Captures an authorized payment the caller holds locked: the money is
   * now the acquirer's debt to us and the merchant's pending balance.
   */
  async captureLocked(payment: Payment): Promise<Payment> {
    const card = payment.card!;
    await this.acquirer.capture(card.authorizationId!, payment.amount);

    const accounts = merchantAccounts(payment.merchantId);
    await this.postLedger.execute({
      description: `Card capture ${card.authorizationId} for ${payment.id}`,
      source: 'card',
      externalReference: card.authorizationId!,
      entries: nonZero([
        {
          accountId: PlatformAccounts.ACQUIRER_RECEIVABLE,
          amount: payment.amount,
          currency: payment.currency,
        },
        {
          accountId: accounts.pending,
          amount: -payment.net,
          currency: payment.currency,
        },
        {
          accountId: PlatformAccounts.FEE_REVENUE,
          amount: -payment.fee,
          currency: payment.currency,
        },
      ]),
    });

    const now = new Date();
    const captured = payment.capture(now);
    await this.payments.update(captured);
    // one receivable per installment, D+30 each
    await this.scheduleReceivables.execute({
      merchantId: captured.merchantId,
      paymentId: captured.id,
      net: captured.net,
      currency: captured.currency,
      method: 'credit_card',
      installments: card.installments,
      at: now,
    });
    await this.publishEvent.execute(
      captured.merchantId,
      EventTypes.PAYMENT_SUCCEEDED,
      toPaymentResource(captured),
      now,
    );
    return captured;
  }
}
