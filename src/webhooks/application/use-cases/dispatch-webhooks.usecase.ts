import { Inject, Injectable, Logger } from '@nestjs/common';
import { nextAttemptAt } from '../../domain/retry-schedule';
import { SIGNATURE_HEADER, signPayload } from '../../domain/signature';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type {
  DueDelivery,
  WebhookRepository,
} from '../../domain/ports/webhook.repository';
import { WEBHOOK_SENDER } from '../../domain/ports/webhook-sender';
import type { WebhookSender } from '../../domain/ports/webhook-sender';

const BATCH_SIZE = 20;
// longer than the sender's timeout, so a slow delivery is not sent twice
const LEASE_MS = 60_000;

export type DispatchResult = {
  delivered: number;
  retrying: number;
  failed: number;
};

@Injectable()
export class DispatchWebhooksUseCase {
  private readonly logger = new Logger(DispatchWebhooksUseCase.name);

  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
    @Inject(WEBHOOK_SENDER) private readonly sender: WebhookSender,
  ) {}

  /** Sends one batch of due deliveries (at-least-once, ADR 0003). */
  async execute(now: Date = new Date()): Promise<DispatchResult> {
    const due = await this.repository.leaseDue(now, BATCH_SIZE, LEASE_MS);
    const outcomes = await Promise.all(due.map((d) => this.deliver(d)));

    return {
      delivered: outcomes.filter((o) => o === 'delivered').length,
      retrying: outcomes.filter((o) => o === 'retrying').length,
      failed: outcomes.filter((o) => o === 'failed').length,
    };
  }

  private async deliver(
    delivery: DueDelivery,
  ): Promise<'delivered' | 'retrying' | 'failed'> {
    const body = delivery.event.toJson();
    const sentAt = new Date();
    const headers = {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: signPayload(
        delivery.endpoint.secret,
        body,
        Math.floor(sentAt.getTime() / 1000),
      ),
    };

    let failure: { status: number | null; error: string };
    try {
      const { status } = await this.sender.send(
        delivery.endpoint.url,
        headers,
        body,
      );
      if (status >= 200 && status < 300) {
        await this.repository.recordSuccess(delivery.id, sentAt, status);
        return 'delivered';
      }
      failure = { status, error: `Endpoint answered HTTP ${status}` };
    } catch (error) {
      failure = {
        status: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const retryAt = nextAttemptAt(delivery.attempts + 1, sentAt);
    await this.repository.recordFailure(delivery.id, sentAt, failure, retryAt);
    if (!retryAt) {
      this.logger.warn(
        `Giving up on ${delivery.event.type} ${delivery.event.id} to ${delivery.endpoint.url}: ${failure.error}`,
      );
    }
    return retryAt ? 'retrying' : 'failed';
  }
}
