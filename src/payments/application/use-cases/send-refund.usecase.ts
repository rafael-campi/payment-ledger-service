import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { merchantAccounts } from '../../../merchants/domain/merchant-accounts';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { RestoreReceivablesUseCase } from '../../../settlement/application/use-cases/restore-receivables.usecase';
import { ACQUIRER_RAIL } from '../../../rails/acquirer-rail';
import type { AcquirerRail } from '../../../rails/acquirer-rail';
import { PIX_RAIL } from '../../../rails/pix-rail';
import type { PixRail } from '../../../rails/pix-rail';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { Refund, RefundStatus } from '../../domain/entities/refund.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { REFUND_REPOSITORY } from '../../domain/ports/refund.repository';
import type { RefundRepository } from '../../domain/ports/refund.repository';
import { nonZero } from '../ledger-entries';
import { toPaymentResource } from '../payment-resource';
import { toRefundResource } from '../refund-resource';

type RailAnswer =
  | { ok: true; reference: string }
  | { ok: false; reason: string };

@Injectable()
export class SendRefundUseCase {
  private readonly logger = new Logger(SendRefundUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
    @Inject(PIX_RAIL) private readonly pixRail: PixRail,
    @Inject(ACQUIRER_RAIL) private readonly acquirer: AcquirerRail,
    private readonly restoreReceivables: RestoreReceivablesUseCase,
    private readonly postLedger: PostLedgerTransactionUseCase,
    private readonly publishEvent: PublishEventUseCase,
  ) {}

  /**
   * Asks the rail to return the money and settles the refund. Safe to run
   * again: rails are idempotent on the refund id, only a pending refund moves.
   */
  async execute(refund: Refund): Promise<Refund> {
    if (refund.status !== RefundStatus.PENDING) return refund;
    const payment = (await this.payments.findById(
      refund.merchantId,
      refund.paymentId,
    ))!;

    let answer: RailAnswer;
    try {
      answer = await this.askRail(payment, refund);
    } catch (error) {
      // no answer: stays pending, RecoverRefundsUseCase retries
      this.logger.error(`Rail did not answer for refund ${refund.id}`, error);
      return refund;
    }

    return this.uow.run(async () => {
      const locked = await this.refunds.lockById(refund.id);
      if (!locked || locked.status !== RefundStatus.PENDING) {
        return locked ?? refund;
      }
      return answer.ok
        ? this.succeed(locked, payment, answer.reference)
        : this.compensate(locked, answer.reason);
    });
  }

  private async askRail(payment: Payment, refund: Refund): Promise<RailAnswer> {
    if (payment.pix) {
      const result = await this.pixRail.refund({
        endToEndId: payment.pix.endToEndId!,
        amount: refund.amount,
        idempotencyKey: refund.id,
      });
      return result.ok ? { ok: true, reference: result.returnId } : result;
    }
    const result = await this.acquirer.refund({
      authorizationId: payment.card!.authorizationId!,
      amount: refund.amount,
      idempotencyKey: refund.id,
    });
    return result.ok ? { ok: true, reference: result.refundId } : result;
  }

  private async succeed(
    refund: Refund,
    payment: Payment,
    reference: string,
  ): Promise<Refund> {
    const now = new Date();
    // a Pix devolução leaves our settlement account; a card refund is netted
    // from what the acquirer owes us
    const from = payment.pix
      ? PlatformAccounts.PIX_SETTLEMENT
      : PlatformAccounts.ACQUIRER_RECEIVABLE;
    await this.postLedger.execute({
      description: `Refund ${refund.id} sent (${reference})`,
      source: 'refund',
      externalReference: `${refund.id}:sent`,
      entries: [
        {
          accountId: PlatformAccounts.REFUND_IN_TRANSIT,
          amount: refund.amount,
          currency: refund.currency,
        },
        { accountId: from, amount: -refund.amount, currency: refund.currency },
      ],
    });

    const succeeded = refund.succeed(reference, now);
    await this.refunds.update(succeeded);
    await this.publishEvent.execute(
      refund.merchantId,
      EventTypes.REFUND_SUCCEEDED,
      toRefundResource(succeeded),
      now,
    );

    const current = await this.payments.lockById(
      refund.merchantId,
      refund.paymentId,
    );
    if (current?.status === PaymentStatus.REFUNDED) {
      await this.publishEvent.execute(
        refund.merchantId,
        EventTypes.PAYMENT_REFUNDED,
        toPaymentResource(current),
        now,
      );
    }
    return succeeded;
  }

  /** The rail refused: undo exactly what the intent did. */
  private async compensate(refund: Refund, reason: string): Promise<Refund> {
    const now = new Date();
    const restored = await this.restoreReceivables.execute(refund.reversals);
    const accounts = merchantAccounts(refund.merchantId);
    await this.postLedger.execute({
      description: `Refund ${refund.id} refused (${reason})`,
      source: 'refund',
      externalReference: `${refund.id}:reversed`,
      entries: nonZero([
        {
          accountId: PlatformAccounts.REFUND_IN_TRANSIT,
          amount: refund.amount,
          currency: refund.currency,
        },
        {
          accountId: accounts.pending,
          amount: -restored.toPending,
          currency: refund.currency,
        },
        {
          accountId: accounts.available,
          // receivables released meanwhile cannot take their part back
          amount: -(refund.fromAvailable + restored.toAvailable),
          currency: refund.currency,
        },
      ]),
    });

    const payment = (await this.payments.lockById(
      refund.merchantId,
      refund.paymentId,
    ))!;
    await this.payments.update(payment.revertRefund(refund.amount, now));

    const failed = refund.fail(reason, now);
    await this.refunds.update(failed);
    await this.publishEvent.execute(
      refund.merchantId,
      EventTypes.REFUND_FAILED,
      toRefundResource(failed),
      now,
    );
    return failed;
  }
}
