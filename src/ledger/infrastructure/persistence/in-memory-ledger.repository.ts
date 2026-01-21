import { Injectable } from '@nestjs/common';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { Transaction } from '../../domain/entities/transaction.entity';

@Injectable()
export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly transactions: Transaction[] = [];

  async saveTransaction(transaction: Transaction): Promise<void> {
    // Simple append-only storage
    this.transactions.push(transaction);
  }

  async listTransactions(): Promise<Transaction[]> {
    return [...this.transactions];
  }
}
