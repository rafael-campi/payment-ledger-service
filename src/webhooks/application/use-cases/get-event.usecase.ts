import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors';
import { WebhookEvent } from '../../domain/entities/event.entity';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type { WebhookRepository } from '../../domain/ports/webhook.repository';

@Injectable()
export class GetEventUseCase {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
  ) {}

  async execute(merchantId: string, id: string): Promise<WebhookEvent> {
    const event = await this.repository.findEvent(merchantId, id);
    if (!event) {
      throw new NotFoundError(
        'webhooks.event_not_found',
        `Event ${id} does not exist.`,
      );
    }
    return event;
  }
}
