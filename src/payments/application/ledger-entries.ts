import type { PostLedgerEntryInput } from '../../ledger/application/use-cases/post-ledger-transaction.usecase';

// a 0% fee (or a fee that takes it all) must not become a zero-amount entry
export function nonZero(
  entries: PostLedgerEntryInput[],
): PostLedgerEntryInput[] {
  return entries.filter((e) => e.amount !== 0);
}
