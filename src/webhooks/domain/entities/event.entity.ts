import { prefixedId } from '../../../shared/utils/id';

/** Event types merchants can receive (ADR 0003). */
export const EventTypes = {
  PAYMENT_PENDING: 'payment.pending',
  PAYMENT_AUTHORIZED: 'payment.authorized', // card approved, awaiting capture
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_EXPIRED: 'payment.expired',
  PAYMENT_CANCELED: 'payment.canceled',
  PAYMENT_REFUNDED: 'payment.refunded', // fully refunded
  REFUND_SUCCEEDED: 'refund.succeeded',
  REFUND_FAILED: 'refund.failed',
  PAYOUT_PAID: 'payout.paid',
  PAYOUT_FAILED: 'payout.failed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

/** An immutable business fact, addressed to one merchant. */
export class WebhookEvent {
  constructor(
    public readonly id: string, // "evt_...", merchants deduplicate on it
    public readonly merchantId: string,
    public readonly type: string,
    // snapshot of the resource at the moment of the event, as the API shows it
    public readonly data: { object: unknown },
    public readonly createdAt: Date,
  ) {}

  static create(
    merchantId: string,
    type: EventType,
    object: unknown,
    now: Date,
  ): WebhookEvent {
    return new WebhookEvent(
      prefixedId('evt'),
      merchantId,
      type,
      { object },
      now,
    );
  }

  /** The exact bytes delivered and signed. */
  toJson(): string {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      createdAt: this.createdAt.toISOString(),
      data: this.data,
    });
  }
}
