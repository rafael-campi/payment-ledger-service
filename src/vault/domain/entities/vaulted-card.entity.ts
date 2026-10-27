import { prefixedId } from '../../../shared/utils/id';

// a token not used in a payment by then cannot be used anymore
export const TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * A tokenized card as the rest of the PSP may see it: brand, last digits
 * and expiry. The number itself stays encrypted in the vault's table.
 */
export class VaultedCard {
  constructor(
    public readonly id: string, // "tok_...", single use
    public readonly merchantId: string,
    public readonly brand: string,
    public readonly last4: string,
    public readonly expMonth: number,
    public readonly expYear: number,
    public readonly holderName: string | null,
    public readonly createdAt: Date,
    public readonly expiresAt: Date,
    public readonly redeemedByPayment: string | null = null,
    public readonly purgedAt: Date | null = null,
  ) {}

  static create(
    merchantId: string,
    card: { brand: string; pan: string; expMonth: number; expYear: number },
    holderName: string | null,
    now: Date,
  ): VaultedCard {
    return new VaultedCard(
      prefixedId('tok'),
      merchantId,
      card.brand,
      card.pan.slice(-4),
      card.expMonth,
      card.expYear,
      holderName,
      now,
      new Date(now.getTime() + TOKEN_TTL_MS),
    );
  }
}
