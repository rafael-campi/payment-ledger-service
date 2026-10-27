import { DomainError } from '../../../shared/errors';

export enum RefundStatus {
  PENDING = 'pending', // out of the merchant's balance, on its way to the payer
  SUCCEEDED = 'succeeded',
  FAILED = 'failed', // the rail refused: the money went back to the merchant
}

export type RefundProps = {
  id: string; // "re_..."
  merchantId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  // where the merchant's money came from: the payment's unreleased
  // receivables first, then the available balance
  fromPending: number;
  fromAvailable: number;
  reversals: { receivableId: string; amount: number }[];
  railReference: string | null; // devolução id (Pix) or acquirer refund id
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Money going back to the payer. The PSP keeps its fee: the merchant
 * returns the full amount (as Stripe does).
 */
export class Refund {
  readonly id: string;
  readonly merchantId: string;
  readonly paymentId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: RefundStatus;
  readonly reason: string | null;
  readonly fromPending: number;
  readonly fromAvailable: number;
  readonly reversals: { receivableId: string; amount: number }[];
  readonly railReference: string | null;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: RefundProps) {
    this.id = props.id;
    this.merchantId = props.merchantId;
    this.paymentId = props.paymentId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status;
    this.reason = props.reason;
    this.fromPending = props.fromPending;
    this.fromAvailable = props.fromAvailable;
    this.reversals = props.reversals;
    this.railReference = props.railReference;
    this.failureCode = props.failureCode;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  succeed(railReference: string, at: Date): Refund {
    return this.settle(RefundStatus.SUCCEEDED, at, { railReference });
  }

  fail(failureCode: string, at: Date): Refund {
    return this.settle(RefundStatus.FAILED, at, { failureCode });
  }

  private settle(
    status: RefundStatus,
    at: Date,
    changes: Partial<RefundProps>,
  ): Refund {
    if (this.status !== RefundStatus.PENDING) {
      throw new DomainError(
        'refunds.invalid_transition',
        `Refund ${this.id} is ${this.status} and cannot become ${status}.`,
      );
    }
    return new Refund({ ...this, ...changes, status, updatedAt: at });
  }
}
