import { DomainError } from '../../../shared/errors';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { validateDoubleEntry } from './validate-double-entry.rule';

const entry = (amount: number, currency = 'BRL') =>
  new LedgerEntry('e', 'tx', 'acct', amount, currency);

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not-a-domain-error';
  }
  return undefined;
}

describe('validateDoubleEntry', () => {
  it('accepts a balanced transaction in one currency', () => {
    expect(() =>
      validateDoubleEntry([entry(10000), entry(-9901), entry(-99)]),
    ).not.toThrow();
  });

  it.each([
    ['no entries', [], 'ledger.too_few_entries'],
    ['a single entry', [entry(0)], 'ledger.too_few_entries'],
    ['a zero amount', [entry(0), entry(0)], 'ledger.invalid_amount'],
    [
      'a fractional amount',
      [entry(10.5), entry(-10.5)],
      'ledger.invalid_amount',
    ],
    [
      'an unsafe integer',
      [entry(2 ** 53), entry(-(2 ** 53))],
      'ledger.invalid_amount',
    ],
    [
      'a malformed currency',
      [entry(1, 'brl'), entry(-1, 'brl')],
      'ledger.invalid_currency',
    ],
    [
      'mixed currencies',
      [entry(1), entry(-1, 'USD')],
      'ledger.mixed_currencies',
    ],
    [
      'entries that do not sum to zero',
      [entry(100), entry(-99)],
      'ledger.unbalanced',
    ],
  ])('rejects %s', (_, entries, code) => {
    expect(codeOf(() => validateDoubleEntry(entries))).toBe(code);
  });

  it('sums without floating point overflow', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(
      codeOf(() => validateDoubleEntry([entry(big), entry(big), entry(-big)])),
    ).toBe('ledger.unbalanced');
  });
});
