import { Transaction } from '../entities/transaction.entity';

export interface LedgerRepository {
  saveTransaction(transaction: Transaction): Promise<void>;
  listTransactions(): Promise<Transaction[]>;
}
