// single-currency PSP for now; a multi-currency merchant gets one pair per currency
export const MERCHANT_CURRENCY = 'BRL';

/**
 * What the PSP owes a merchant (LIABILITY). Money lands in "pending" and
 * moves to "available" when the receivables schedule releases it (D+N).
 */
export function merchantAccounts(merchantId: string) {
  return {
    pending: `merchant:${merchantId}:pending`,
    available: `merchant:${merchantId}:available`,
  };
}
