import { DomainError } from '../../../shared/errors';
import { LedgerEntry } from '../entities/ledger-entry.entity';

const CURRENCY = /^[A-Z]{3}$/;

export function validateDoubleEntry(entries: LedgerEntry[]): void {
  if (!entries || entries.length < 2) {
    throw new DomainError(
      'ledger.too_few_entries',
      'A transaction needs at least two ledger entries.',
    );
  }

  for (const e of entries) {
    if (!Number.isSafeInteger(e.amount) || e.amount === 0) {
      throw new DomainError(
        'ledger.invalid_amount',
        `Entry amounts must be non-zero integers in the smallest currency unit (got ${e.amount}).`,
      );
    }
    if (!CURRENCY.test(e.currency)) {
      throw new DomainError(
        'ledger.invalid_currency',
        `Currency must be an ISO 4217 code (got ${e.currency}).`,
      );
    }
  }

  const currency = entries[0].currency;
  if (entries.some((e) => e.currency !== currency)) {
    throw new DomainError(
      'ledger.mixed_currencies',
      'All entries in a transaction must use the same currency.',
    );
  }

  // BigInt: many large safe integers can still overflow when summed as numbers
  const sum = entries.reduce((acc, e) => acc + BigInt(e.amount), 0n);
  if (sum !== 0n) {
    throw new DomainError(
      'ledger.unbalanced',
      `Transaction is not balanced: entries sum to ${sum}, expected 0.`,
    );
  }
}
