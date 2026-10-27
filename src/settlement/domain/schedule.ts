const DAY_MS = 24 * 60 * 60 * 1000;

// Pix settles the same day; card money arrives from the acquirer 30 days
// after each installment (the usual Brazilian schedule without anticipation)
export const PIX_SETTLEMENT_DAYS = 0;
export const CARD_DAYS_PER_INSTALLMENT = 30;

export type ScheduledPart = {
  installment: number;
  amount: number;
  availableOn: Date;
};

/**
 * Splits a payment's net amount into release dates. Card installments split
 * evenly, the remainder cents going to the first so the parts sum exactly.
 */
export function releaseSchedule(input: {
  net: number;
  method: 'pix' | 'credit_card';
  installments: number;
  at: Date;
}): ScheduledPart[] {
  if (input.method === 'pix') {
    const part = {
      installment: 1,
      amount: input.net,
      availableOn: new Date(input.at.getTime() + PIX_SETTLEMENT_DAYS * DAY_MS),
    };
    // a 100% fee leaves nothing to release
    return part.amount > 0 ? [part] : [];
  }

  const count = input.installments;
  const base = Math.floor(input.net / count);
  const remainder = input.net - base * count;
  return Array.from({ length: count }, (_, i) => ({
    installment: i + 1,
    amount: base + (i === 0 ? remainder : 0),
    availableOn: new Date(
      input.at.getTime() + (i + 1) * CARD_DAYS_PER_INSTALLMENT * DAY_MS,
    ),
  })).filter((part) => part.amount > 0);
}
