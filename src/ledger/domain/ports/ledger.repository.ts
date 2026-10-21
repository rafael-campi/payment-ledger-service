import { Account } from '../entities/account.entity';
import { Transaction } from '../entities/transaction.entity';

export const LEDGER_REPOSITORY = Symbol('LEDGER_REPOSITORY');

/** Thrown by saveTransaction when (source, externalReference) was already posted. */
export class DuplicateTransactionReferenceError extends Error {
  constructor(
    public readonly source: string,
    public readonly externalReference: string,
  ) {
    super(`Transaction ${source}/${externalReference} was already posted.`);
    this.name = 'DuplicateTransactionReferenceError';
  }
}

/** Debit-positive: the sum of every entry ever posted to the account. */
export type AccountBalance = { account: Account; balance: number };

export interface LedgerRepository {
  /** Appends the transaction and its entries atomically. */
  saveTransaction(transaction: Transaction): Promise<void>;
  findByReference(
    source: string,
    externalReference: string,
  ): Promise<Transaction | null>;
  listTransactions(): Promise<Transaction[]>;

  findAccounts(ids: string[]): Promise<Account[]>;
  /** Accounts that already exist are left untouched. */
  insertAccounts(accounts: Account[]): Promise<void>;
  /** All accounts when ids is omitted. Balances are derived, never stored. */
  accountBalances(ids?: string[]): Promise<AccountBalance[]>;
}
