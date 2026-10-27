import { Inject, Injectable } from '@nestjs/common';
import { WebhookEvent } from '../../domain/entities/event.entity';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type { WebhookRepository } from '../../domain/ports/webhook.repository';

@Injectable()
export class ListEventsUseCase {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
  ) {}

  execute(
    merchantId: string,
    filter: { type?: string; limit: number },
  ): Promise<WebhookEvent[]> {
    return this.repository.listEvents(merchantId, filter);
  }
}
