import { Inject, Injectable } from '@nestjs/common';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { prefixedId } from '../../../shared/utils/id';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { merchantAccounts } from '../../../merchants/domain/merchant-accounts';
import { ReverseReceivablesUseCase } from '../../../settlement/application/use-cases/reverse-receivables.usecase';
import { PaymentStatus } from '../../domain/entities/payment.entity';
import { Refund, RefundStatus } from '../../domain/entities/refund.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { REFUND_REPOSITORY } from '../../domain/ports/refund.repository';
import type { RefundRepository } from '../../domain/ports/refund.repository';
import { nonZero } from '../ledger-entries';
import { SendRefundUseCase } from './send-refund.usecase';

@Injectable()
export class CreateRefundUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
    private readonly reverseReceivables: ReverseReceivablesUseCase,
    private readonly postLedger: PostLedgerTransactionUseCase,
    private readonly sendRefund: SendRefundUseCase,
  ) {}

  /**
   * Refunds all or part of a succeeded payment. The money leaves the
   * merchant's balance first (intent, copilot_prompt.md): from the payment's
   * unreleased receivables, then from the available balance, which may go
   * negative. Then the rail returns it to the payer.
   */
  async execute(input: {
    merchantId: string;
    paymentId: string;
    amount?: number;
    reason?: string;
  }): Promise<Refund> {
    const refund = await this.uow.run(async () => {
      // the lock serializes refunds of one payment: never more than paid
      const payment = await this.payments.lockById(
        input.merchantId,
        input.paymentId,
      );
      if (!payment) {
        throw new NotFoundError(
          'payments.not_found',
          `Payment ${input.paymentId} does not exist.`,
        );
      }
      if (payment.status !== PaymentStatus.SUCCEEDED) {
        throw new DomainError(
          'refunds.payment_not_refundable',
          `Payment ${payment.id} is ${payment.status}; only succeeded payments can be refunded.`,
        );
      }

      const now = new Date();
      const amount = input.amount ?? payment.refundable;
      const reserved = payment.refund(amount, now);
      const reversals = await this.reverseReceivables.execute(
        payment.id,
        amount,
      );
      const fromPending = reversals.reduce((sum, r) => sum + r.amount, 0);

      const created = new Refund({
        id: prefixedId('re'),
        merchantId: payment.merchantId,
        paymentId: payment.id,
        amount,
        currency: payment.currency,
        status: RefundStatus.PENDING,
        reason: input.reason ?? null,
        fromPending,
        fromAvailable: amount - fromPending,
        reversals,
        railReference: null,
        failureCode: null,
        createdAt: now,
        updatedAt: now,
      });
      await this.refunds.save(created);
      await this.payments.update(reserved);

      const accounts = merchantAccounts(payment.merchantId);
      await this.postLedger.execute({
        description: `Refund ${created.id} of ${payment.id}`,
        source: 'refund',
        externalReference: `${created.id}:intent`,
        entries: nonZero([
          {
            accountId: accounts.pending,
            amount: fromPending,
            currency: payment.currency,
          },
          {
            accountId: accounts.available,
            amount: created.fromAvailable,
            currency: payment.currency,
          },
          {
            accountId: PlatformAccounts.REFUND_IN_TRANSIT,
            amount: -amount,
            currency: payment.currency,
          },
        ]),
      });
      return created;
    });

    return this.sendRefund.execute(refund);
  }
}
