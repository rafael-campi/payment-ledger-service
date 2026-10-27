import { Inject, Injectable } from '@nestjs/common';
import { WebhookEndpoint } from '../../domain/entities/webhook-endpoint.entity';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type { WebhookRepository } from '../../domain/ports/webhook.repository';

@Injectable()
export class ListWebhookEndpointsUseCase {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
  ) {}

  execute(merchantId: string): Promise<WebhookEndpoint[]> {
    return this.repository.listEndpoints(merchantId);
  }
}
