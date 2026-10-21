import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { merchantAccounts } from '../../../merchants/domain/merchant-accounts';
import { RECEIVABLE_REPOSITORY } from '../../domain/ports/receivable.repository';
import type { ReceivableRepository } from '../../domain/ports/receivable.repository';

const BATCH_SIZE = 200;

@Injectable()
export class ReleaseReceivablesUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivables: ReceivableRepository,
    private readonly postLedger: PostLedgerTransactionUseCase,
  ) {}

  /** Moves due receivables from pending to available; returns how many. */
  async execute(now: Date = new Date()): Promise<number> {
    return this.uow.run(async () => {
      const due = await this.receivables.lockDue(now, BATCH_SIZE);
      for (const receivable of due) {
        // fully refunded parts have nothing left to release
        if (receivable.remaining > 0) {
          const accounts = merchantAccounts(receivable.merchantId);
          await this.postLedger.execute({
            description: `Release ${receivable.id} (installment ${receivable.installment} of ${receivable.paymentId})`,
            source: 'settlement',
            externalReference: receivable.id,
            entries: [
              {
                accountId: accounts.pending,
                amount: receivable.remaining,
                currency: receivable.currency,
              },
              {
                accountId: accounts.available,
                amount: -receivable.remaining,
                currency: receivable.currency,
              },
            ],
          });
        }
        await this.receivables.markReleased(receivable.id, now);
      }
      return due.length;
    });
  }
}
