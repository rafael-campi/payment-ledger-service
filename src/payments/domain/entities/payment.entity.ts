import { DomainError } from '../../../shared/errors';

export enum PaymentStatus {
  PENDING = 'pending', // Pix waiting for the payer; card waiting for the acquirer
  AUTHORIZED = 'authorized', // card approved, money held, not captured yet
  SUCCEEDED = 'succeeded',
  REFUNDED = 'refunded', // the whole amount went back to the payer
  FAILED = 'failed', // card declined; a Pix charge never fails, it expires
  EXPIRED = 'expired',
  CANCELED = 'canceled',
}

export enum PaymentMethod {
  PIX = 'pix',
  CREDIT_CARD = 'credit_card',
}

export type PixDetails = {
  txid: string;
  copiaECola: string;
  endToEndId: string | null; // set when the money arrives
  paidAt: Date | null;
};

/** What a card payment knows about the card: never the number (ADR 0002). */
export type CardDetails = {
  tokenId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  installments: number;
  capture: boolean; // false: authorize now, capture later
  authorizationId: string | null;
  authorizedAt: Date | null;
  capturedAt: Date | null;
};

export type PaymentProps = {
  id: string; // "pay_..."
  merchantId: string;
  amount: number; // cents
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  description: string | null;
  metadata: Record<string, string>;
  // fixed at creation, so a later change to the merchant's plan does not
  // change what an open charge costs
  fee: number;
  pix: PixDetails | null;
  card: CardDetails | null;
  failureCode: string | null;
  // refunded or being refunded; reserved when a refund starts, given back if it fails
  amountRefunded: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

// a card authorization holds the money for this long before it lapses
export const AUTHORIZATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Intent and process, not money (copilot_prompt.md): the ledger holds the
 * truth. Transitions return a new instance and only leave open states
 * (pending, authorized).
 */
export class Payment {
  readonly id: string;
  readonly merchantId: string;
  readonly amount: number;
  readonly currency: string;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly description: string | null;
  readonly metadata: Record<string, string>;
  readonly fee: number;
  readonly pix: PixDetails | null;
  readonly card: CardDetails | null;
  readonly failureCode: string | null;
  readonly amountRefunded: number;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.merchantId = props.merchantId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.method = props.method;
    this.status = props.status;
    this.description = props.description;
    this.metadata = props.metadata;
    this.fee = props.fee;
    this.pix = props.pix;
    this.card = props.card;
    this.failureCode = props.failureCode;
    this.amountRefunded = props.amountRefunded;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get net(): number {
    return this.amount - this.fee;
  }

  get refundable(): number {
    return this.status === PaymentStatus.SUCCEEDED
      ? this.amount - this.amountRefunded
      : 0;
  }

  get isOpen(): boolean {
    return (
      this.status === PaymentStatus.PENDING ||
      this.status === PaymentStatus.AUTHORIZED
    );
  }

  /** A Pix charge the payer can still pay. */
  isPayableAt(at: Date): boolean {
    return this.status === PaymentStatus.PENDING && at < this.expiresAt;
  }

  succeedWithPix(endToEndId: string, paidAt: Date): Payment {
    return this.transition(PaymentStatus.SUCCEEDED, paidAt, {
      pix: { ...this.requirePix(), endToEndId, paidAt },
    });
  }

  authorize(authorizationId: string, at: Date): Payment {
    return this.transition(PaymentStatus.AUTHORIZED, at, {
      card: { ...this.requireCard(), authorizationId, authorizedAt: at },
    });
  }

  capture(at: Date): Payment {
    return this.transition(
      PaymentStatus.SUCCEEDED,
      at,
      { card: { ...this.requireCard(), capturedAt: at } },
      [PaymentStatus.AUTHORIZED],
    );
  }

  fail(failureCode: string, at: Date): Payment {
    return this.transition(PaymentStatus.FAILED, at, { failureCode });
  }

  /** Reserves part of a succeeded payment for a refund. */
  refund(amount: number, at: Date): Payment {
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > this.refundable
    ) {
      throw new DomainError(
        'refunds.amount_not_refundable',
        `Payment ${this.id} has ${this.refundable} cents left to refund (asked ${amount}).`,
      );
    }
    const amountRefunded = this.amountRefunded + amount;
    return new Payment({
      ...this,
      amountRefunded,
      status:
        amountRefunded === this.amount
          ? PaymentStatus.REFUNDED
          : PaymentStatus.SUCCEEDED,
      updatedAt: at,
    });
  }

  /** Gives back the reservation of a refund the rail refused. */
  revertRefund(amount: number, at: Date): Payment {
    if (amount <= 0 || amount > this.amountRefunded) {
      throw new DomainError(
        'refunds.invalid_revert',
        `Payment ${this.id} cannot give back ${amount} cents of refunds.`,
      );
    }
    return new Payment({
      ...this,
      amountRefunded: this.amountRefunded - amount,
      status: PaymentStatus.SUCCEEDED,
      updatedAt: at,
    });
  }

  expire(at: Date): Payment {
    return this.transition(PaymentStatus.EXPIRED, at, {}, OPEN);
  }

  cancel(at: Date): Payment {
    return this.transition(PaymentStatus.CANCELED, at, {}, OPEN);
  }

  private requirePix(): PixDetails {
    if (!this.pix) {
      throw new DomainError(
        'payments.not_pix',
        `Payment ${this.id} is not a Pix payment.`,
      );
    }
    return this.pix;
  }

  private requireCard(): CardDetails {
    if (!this.card) {
      throw new DomainError(
        'payments.not_card',
        `Payment ${this.id} is not a card payment.`,
      );
    }
    return this.card;
  }

  private transition(
    to: PaymentStatus,
    at: Date,
    changes: Partial<PaymentProps> = {},
    from: PaymentStatus[] = [PaymentStatus.PENDING],
  ): Payment {
    if (!from.includes(this.status)) {
      throw new DomainError(
        'payments.invalid_transition',
        `Payment ${this.id} is ${this.status} and cannot become ${to}.`,
      );
    }
    return new Payment({ ...this, ...changes, status: to, updatedAt: at });
  }
}

const OPEN = [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED];
