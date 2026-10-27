/**
 * The PSP's own accounts (chart of accounts in copilot_prompt.md). Opened in
 * BRL by migration CreateLedgerAccounts; merchant accounts are opened on onboarding.
 */
export const PlatformAccounts = {
  PIX_SETTLEMENT: 'pix-settlement',
  ACQUIRER_RECEIVABLE: 'acquirer-receivable',
  BANK: 'bank',
  PAYOUT_IN_TRANSIT: 'payout-in-transit',
  REFUND_IN_TRANSIT: 'refund-in-transit',
  FEE_REVENUE: 'fee-revenue',
  RAIL_COSTS: 'rail-costs',
  SUSPENSE: 'suspense',
} as const;
