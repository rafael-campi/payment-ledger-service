export class Merchant {
  constructor(
    public readonly id: string, // "mch_..."
    public readonly name: string,
    // MDR on Pix, in basis points (99 = 0.99%)
    public readonly pixFeeBps: number,
    // MDR on credit card, in basis points (299 = 2.99%)
    public readonly cardFeeBps: number,
    public readonly createdAt: Date = new Date(),
    // where payouts go; payouts are refused until the merchant sets it
    public readonly payoutPixKey: string | null = null,
  ) {}
}
