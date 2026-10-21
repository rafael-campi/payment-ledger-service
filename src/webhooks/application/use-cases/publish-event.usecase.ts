import { Inject, Injectable } from '@nestjs/common';
import { EventType, WebhookEvent } from '../../domain/entities/event.entity';
import { WEBHOOK_REPOSITORY } from '../../domain/ports/webhook.repository';
import type { WebhookRepository } from '../../domain/ports/webhook.repository';

@Injectable()
export class PublishEventUseCase {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepository,
  ) {}

  /**
   * Writes to the outbox. Call it inside the unit of work that changes the
   * state the event describes, so both commit or neither does (ADR 0003).
   */
  async execute(
    merchantId: string,
    type: EventType,
    object: unknown,
    at: Date,
  ): Promise<WebhookEvent> {
    const event = WebhookEvent.create(merchantId, type, object, at);
    await this.repository.saveEvent(event);
    return event;
  }
}
