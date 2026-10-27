import { DomainError } from '../../../shared/errors';

export enum PayoutStatus {
  PENDING = 'pending', // money left the merchant's balance, the Pix is on its way
  PAID = 'paid',
  FAILED = 'failed', // the money went back to the merchant's balance
}

/** A transfer of the merchant's available balance to their Pix key. */
export class Payout {
  constructor(
    public readonly id: string, // "po_..."
    public readonly merchantId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly pixKey: string,
    public readonly status: PayoutStatus,
    public readonly endToEndId: string | null,
    public readonly failureCode: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  paid(endToEndId: string, at: Date): Payout {
    return this.settle(PayoutStatus.PAID, at, endToEndId, null);
  }

  fail(failureCode: string, at: Date): Payout {
    return this.settle(PayoutStatus.FAILED, at, null, failureCode);
  }

  private settle(
    status: PayoutStatus,
    at: Date,
    endToEndId: string | null,
    failureCode: string | null,
  ): Payout {
    if (this.status !== PayoutStatus.PENDING) {
      throw new DomainError(
        'settlement.invalid_transition',
        `Payout ${this.id} is ${this.status} and cannot become ${status}.`,
      );
    }
    return new Payout(
      this.id,
      this.merchantId,
      this.amount,
      this.currency,
      this.pixKey,
      status,
      endToEndId,
      failureCode,
      this.createdAt,
      at,
    );
  }
}
