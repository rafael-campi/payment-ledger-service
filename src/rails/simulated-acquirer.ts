import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AcquirerRail, AuthorizationResult } from './acquirer-rail';
import { RailResult } from './pix-rail';

/**
 * Test cards, as in Stripe's docs. Any other valid number is approved.
 * Exported so tests and docs name the same cards.
 */
export const TestCards = {
  APPROVED_VISA: '4242424242424242',
  APPROVED_MASTERCARD: '5555555555554444',
  DECLINED: '4000000000000002',
  INSUFFICIENT_FUNDS: '4000000000009995',
  EXPIRED_AT_ISSUER: '4000000000000069',
  PROCESSING_ERROR: '4000000000000119',
} as const;

const DECLINES: Record<string, string> = {
  [TestCards.DECLINED]: 'card_declined',
  [TestCards.INSUFFICIENT_FUNDS]: 'insufficient_funds',
  [TestCards.EXPIRED_AT_ISSUER]: 'expired_card',
  [TestCards.PROCESSING_ERROR]: 'processing_error',
};

/**
 * Stands in for the acquirer (ADR 0001). Stateless: the answer depends only
 * on the card and the idempotency key, so retries are naturally idempotent
 * and survive restarts.
 */
@Injectable()
export class SimulatedAcquirer implements AcquirerRail {
  authorize(input: {
    idempotencyKey: string;
    pan: string;
  }): Promise<AuthorizationResult> {
    const declineCode = DECLINES[input.pan];
    if (declineCode) return Promise.resolve({ approved: false, declineCode });

    const authorizationId = `auth_${createHash('sha256')
      .update(input.idempotencyKey)
      .digest('hex')
      .slice(0, 24)}`;
    return Promise.resolve({ approved: true, authorizationId });
  }

  capture(): Promise<void> {
    return Promise.resolve();
  }

  void(): Promise<void> {
    return Promise.resolve();
  }

  refund(input: {
    idempotencyKey: string;
  }): Promise<RailResult<{ refundId: string }>> {
    return Promise.resolve({
      ok: true,
      refundId: `rfnd_${createHash('sha256')
        .update(input.idempotencyKey)
        .digest('hex')
        .slice(0, 24)}`,
    });
  }
}
