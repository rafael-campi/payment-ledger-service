import { Inject, Injectable } from '@nestjs/common';
import { RECEIVABLE_REPOSITORY } from '../../domain/ports/receivable.repository';
import type {
  ReceivableRepository,
  ReceivableReversal,
} from '../../domain/ports/receivable.repository';

@Injectable()
export class ReverseReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivables: ReceivableRepository,
  ) {}

  /**
   * Takes up to `amount` from a payment's unreleased receivables, latest
   * installments first, inside the caller's unit of work. Returns what was
   * taken from each; the caller funds the rest from the available balance.
   */
  async execute(
    paymentId: string,
    amount: number,
  ): Promise<ReceivableReversal[]> {
    const reversals: ReceivableReversal[] = [];
    let left = amount;
    for (const receivable of await this.receivables.lockUnreleased(paymentId)) {
      if (left === 0) break;
      const take = Math.min(left, receivable.remaining);
      if (take === 0) continue;
      await this.receivables.addReversed(receivable.id, take);
      reversals.push({ receivableId: receivable.id, amount: take });
      left -= take;
    }
    return reversals;
  }
}
