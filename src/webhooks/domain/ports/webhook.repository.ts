import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookEvent } from '../entities/event.entity';

export const WEBHOOK_REPOSITORY = Symbol('WEBHOOK_REPOSITORY');

export type DueDelivery = {
  id: string;
  attempts: number;
  event: WebhookEvent;
  endpoint: WebhookEndpoint;
};

export interface WebhookRepository {
  saveEndpoint(endpoint: WebhookEndpoint): Promise<void>;
  saveDisabled(endpoint: WebhookEndpoint): Promise<void>;
  /** Scoped by merchant: another merchant's endpoint is reported as missing. */
  findEndpoint(merchantId: string, id: string): Promise<WebhookEndpoint | null>;
  listEndpoints(merchantId: string): Promise<WebhookEndpoint[]>;

  /** Stores the event and one pending delivery per active endpoint of its merchant. */
  saveEvent(event: WebhookEvent): Promise<void>;
  findEvent(merchantId: string, id: string): Promise<WebhookEvent | null>;
  listEvents(
    merchantId: string,
    filter: { type?: string; limit: number },
  ): Promise<WebhookEvent[]>;

  /**
   * Claims up to `limit` due deliveries for `leaseMs`, skipping rows another
   * dispatcher holds. A claim that is never recorded becomes due again.
   */
  leaseDue(now: Date, limit: number, leaseMs: number): Promise<DueDelivery[]>;
  recordSuccess(id: string, at: Date, status: number): Promise<void>;
  /** nextAttemptAt null marks the delivery as failed for good. */
  recordFailure(
    id: string,
    at: Date,
    failure: { status: number | null; error: string },
    nextAttemptAt: Date | null,
  ): Promise<void>;
}
