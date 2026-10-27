import { DomainError } from '../../../shared/errors';

// Sources the PSP's own flows post with. Reconciliation matches them to
// payments, refunds, payouts and the receivables schedule, so an operator
// posting with them would create money nothing explains.
const RESERVED_SOURCES = [
  'pix',
  'card',
  'refund',
  'payout',
  'settlement',
  'suspense-return',
];

// pending moves only through the receivables schedule (ADR 0006)
const SCHEDULED_ACCOUNT = /^merchant:.+:pending$/;

/** What an operator may post by hand through /ledger (adjustments). */
export function validateManualPosting(input: {
  source: string;
  entries: { accountId: string }[];
}): void {
  if (RESERVED_SOURCES.includes(input.source)) {
    throw new DomainError(
      'ledger.reserved_source',
      `Source "${input.source}" is reserved for the PSP's own flows; use "manual" or another adjustment source.`,
    );
  }
  const scheduled = input.entries.find((e) =>
    SCHEDULED_ACCOUNT.test(e.accountId),
  );
  if (scheduled) {
    throw new DomainError(
      'ledger.pending_is_scheduled',
      `${scheduled.accountId} moves only through the receivables schedule; adjust the available balance instead.`,
    );
  }
}
