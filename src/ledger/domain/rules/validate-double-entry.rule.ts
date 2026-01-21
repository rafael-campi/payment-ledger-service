import { LedgerEntry } from '../entities/ledger-entry.entity';

export function validateDoubleEntry(entries: LedgerEntry[]): void {
  if (!entries || entries.length === 0) {
    throw new Error('Transaction must have at least one ledger entry');
  }

  const currency = entries[0].currency;
  for (const e of entries) {
    if (e.currency !== currency) {
      throw new Error('All entries in a transaction must use the same currency');
    }
  }

  const sum = entries.reduce((acc, e) => acc + e.amount, 0);
  if (sum !== 0) {
    throw new Error('Transaction is not balanced (double-entry violation)');
  }
}
