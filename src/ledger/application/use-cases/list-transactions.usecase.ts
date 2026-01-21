import { Injectable, Inject } from '@nestjs/common';
import type { LedgerRepository } from '../../domain/ports/ledger.repository';
import { Transaction } from '../../domain/entities/transaction.entity';

@Injectable()
export class ListTransactionsUseCase {
  constructor(@Inject('LedgerRepository') private readonly repository: LedgerRepository) {}

  async execute(): Promise<Transaction[]> {
    return this.repository.listTransactions();
  }
}
