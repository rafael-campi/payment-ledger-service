import {
  AccountBalance,
  DuplicateTransactionReferenceError,
  LedgerRepository,
} from '../../domain/ports/ledger.repository';
import { Account } from '../../domain/entities/account.entity';
import { Transaction } from '../../domain/entities/transaction.entity';

/** Test double; production uses TypeOrmLedgerRepository. */
export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly transactions: Transaction[] = [];
  private readonly accounts = new Map<string, Account>();

  async saveTransaction(transaction: Transaction): Promise<void> {
    if (
      await this.findByReference(
        transaction.source,
        transaction.externalReference,
      )
    ) {
      throw new DuplicateTransactionReferenceError(
        transaction.source,
        transaction.externalReference,
      );
    }
    this.transactions.push(transaction);
  }

  findByReference(
    source: string,
    externalReference: string,
  ): Promise<Transaction | null> {
    return Promise.resolve(
      this.transactions.find(
        (tx) =>
          tx.source === source && tx.externalReference === externalReference,
      ) ?? null,
    );
  }

  listTransactions(): Promise<Transaction[]> {
    return Promise.resolve([...this.transactions]);
  }

  findAccounts(ids: string[]): Promise<Account[]> {
    return Promise.resolve(ids.flatMap((id) => this.accounts.get(id) ?? []));
  }

  insertAccounts(accounts: Account[]): Promise<void> {
    for (const account of accounts) {
      if (!this.accounts.has(account.id))
        this.accounts.set(account.id, account);
    }
    return Promise.resolve();
  }

  accountBalances(ids?: string[]): Promise<AccountBalance[]> {
    const accounts = ids
      ? ids.flatMap((id) => this.accounts.get(id) ?? [])
      : [...this.accounts.values()];
    return Promise.resolve(
      accounts.map((account) => ({
        account,
        balance: this.transactions
          .flatMap((tx) => tx.entries)
          .filter((e) => e.accountId === account.id)
          .reduce((sum, e) => sum + e.amount, 0),
      })),
    );
  }
}
