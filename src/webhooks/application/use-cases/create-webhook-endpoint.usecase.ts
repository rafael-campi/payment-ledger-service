import { Inject, Injectable } from '@nestjs/common';
import { WebhookEndpoint } from '../../domain/entities/webhook-endpoint.entity';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type { WebhookRepository } from '../../domain/ports/webhook.repository';

@Injectable()
export class CreateWebhookEndpointUseCase {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
  ) {}

  async execute(merchantId: string, url: string): Promise<WebhookEndpoint> {
    const endpoint = WebhookEndpoint.create(merchantId, url, new Date());
    await this.repository.saveEndpoint(endpoint);
    return endpoint;
  }
}
