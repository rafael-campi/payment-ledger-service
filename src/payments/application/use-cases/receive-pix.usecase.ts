import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { merchantAccounts } from '../../../merchants/domain/merchant-accounts';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { ScheduleReceivablesUseCase } from '../../../settlement/application/use-cases/schedule-receivables.usecase';
import { Payment } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { toPaymentResource } from '../payment-resource';
import { nonZero } from '../ledger-entries';

/** A Pix credited to the PSP's settlement account, as the SPI reports it. */
export type PixReceived = {
  txid: string | null; // null when the payer used a key, not one of our charges
  endToEndId: string;
  amount: number; // cents
  paidAt: Date;
};

export type ReceivePixResult = {
  // succeeded: the payment was paid; duplicate: this endToEndId was already
  // applied; unmatched: the money is held in suspense for a devolução
  outcome: 'succeeded' | 'duplicate' | 'unmatched';
  payment: Payment | null;
};

@Injectable()
export class ReceivePixUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    private readonly postLedger: PostLedgerTransactionUseCase,
    private readonly publishEvent: PublishEventUseCase,
    private readonly scheduleReceivables: ScheduleReceivablesUseCase,
  ) {}

  /**
   * The money already arrived, so it is always recorded. Ledger posting,
   * payment transition and outbox event commit together (ADR 0002).
   */
  async execute(pix: PixReceived): Promise<ReceivePixResult> {
    return this.uow.run(async () => {
      // the lock serializes this with expiry, cancellation and duplicate notices
      const payment = pix.txid
        ? await this.payments.lockByTxid(pix.txid)
        : null;

      if (payment?.pix?.endToEndId === pix.endToEndId) {
        return { outcome: 'duplicate', payment };
      }
      if (
        !payment ||
        !payment.isPayableAt(pix.paidAt) ||
        pix.amount !== payment.amount
      ) {
        await this.holdInSuspense(pix, payment);
        return { outcome: 'unmatched', payment };
      }

      const accounts = merchantAccounts(payment.merchantId);
      await this.postLedger.execute({
        description: `Pix ${pix.endToEndId} for ${payment.id}`,
        source: 'pix',
        externalReference: pix.endToEndId,
        entries: nonZero([
          {
            accountId: PlatformAccounts.PIX_SETTLEMENT,
            amount: pix.amount,
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

      const succeeded = payment.succeedWithPix(pix.endToEndId, pix.paidAt);
      await this.payments.update(succeeded);
      // the net amount now waits in merchant:pending until its release date
      await this.scheduleReceivables.execute({
        merchantId: succeeded.merchantId,
        paymentId: succeeded.id,
        net: succeeded.net,
        currency: succeeded.currency,
        method: 'pix',
        installments: 1,
        at: pix.paidAt,
      });
      await this.publishEvent.execute(
        succeeded.merchantId,
        EventTypes.PAYMENT_SUCCEEDED,
        toPaymentResource(succeeded),
        new Date(),
      );
      return { outcome: 'succeeded', payment: succeeded };
    });
  }

  // No charge to match, a charge no longer payable, or a different amount:
  // the money is ours to return, never the merchant's.
  private async holdInSuspense(pix: PixReceived, payment: Payment | null) {
    const currency = payment?.currency ?? 'BRL';
    await this.postLedger.execute({
      description: payment
        ? `Unmatched Pix ${pix.endToEndId} for ${payment.id} (${payment.status})`
        : `Unmatched Pix ${pix.endToEndId}`,
      source: 'pix',
      externalReference: pix.endToEndId,
      entries: [
        {
          accountId: PlatformAccounts.PIX_SETTLEMENT,
          amount: pix.amount,
          currency,
        },
        { accountId: PlatformAccounts.SUSPENSE, amount: -pix.amount, currency },
      ],
    });
  }
}
