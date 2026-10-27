import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors';
import { WebhookEndpoint } from '../../domain/entities/webhook-endpoint.entity';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type { WebhookRepository } from '../../domain/ports/webhook.repository';

@Injectable()
export class DisableWebhookEndpointUseCase {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
  ) {}

  /** Idempotent. Pending deliveries to a disabled endpoint are no longer sent. */
  async execute(merchantId: string, id: string): Promise<WebhookEndpoint> {
    const endpoint = await this.repository.findEndpoint(merchantId, id);
    if (!endpoint) {
      throw new NotFoundError(
        'webhooks.endpoint_not_found',
        `Webhook endpoint ${id} does not exist.`,
      );
    }
    if (!endpoint.isActive) return endpoint;

    const disabled = endpoint.disable(new Date());
    await this.repository.saveDisabled(disabled);
    return disabled;
  }
}
