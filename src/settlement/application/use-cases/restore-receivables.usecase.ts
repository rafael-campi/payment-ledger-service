import { Inject, Injectable } from '@nestjs/common';
import { RECEIVABLE_REPOSITORY } from '../../domain/ports/receivable.repository';
import type {
  ReceivableRepository,
  ReceivableReversal,
} from '../../domain/ports/receivable.repository';

@Injectable()
export class RestoreReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivables: ReceivableRepository,
  ) {}

  /**
   * Undoes reversals of a refund that did not go through. A receivable
   * released in the meantime cannot take its part back, so that part goes
   * straight to the available balance. Returns how much was restored where.
   */
  async execute(
    reversals: ReceivableReversal[],
  ): Promise<{ toPending: number; toAvailable: number }> {
    const current = new Map(
      (
        await this.receivables.lockByIds(reversals.map((r) => r.receivableId))
      ).map((r) => [r.id, r]),
    );
    let toPending = 0;
    let toAvailable = 0;
    for (const reversal of reversals) {
      const receivable = current.get(reversal.receivableId);
      if (receivable && !receivable.releasedAt) {
        await this.receivables.addReversed(receivable.id, -reversal.amount);
        toPending += reversal.amount;
      } else {
        toAvailable += reversal.amount;
      }
    }
    return { toPending, toAvailable };
  }
}
