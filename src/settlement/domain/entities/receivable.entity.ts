/**
 * Part of a payment's net amount, released from the merchant's pending
 * balance to available on a given date. A refund takes from the parts not
 * released yet (reversedAmount); only what remains is ever released.
 */
export class Receivable {
  constructor(
    public readonly id: string, // "rcv_..."
    public readonly merchantId: string,
    public readonly paymentId: string,
    public readonly installment: number,
    public readonly amount: number,
    public readonly reversedAmount: number,
    public readonly currency: string,
    public readonly availableOn: Date,
    public readonly releasedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  get remaining(): number {
    return this.amount - this.reversedAmount;
  }
}
