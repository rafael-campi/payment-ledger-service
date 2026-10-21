import { Injectable, Inject } from '@nestjs/common';
import { LEDGER_REPOSITORY } from '../../domain/ports/ledger.repository';
import type { LedgerRepository } from '../../domain/ports/ledger.repository';
import { Transaction } from '../../domain/entities/transaction.entity';

@Injectable()
export class ListTransactionsUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly repository: LedgerRepository,
  ) {}

  async execute(): Promise<Transaction[]> {
    return this.repository.listTransactions();
  }
}
