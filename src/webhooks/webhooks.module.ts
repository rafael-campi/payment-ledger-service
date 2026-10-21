import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { WebhookEndpointsController } from './interfaces/http/controllers/webhook-endpoints.controller';
import { EventsController } from './interfaces/http/controllers/events.controller';
import { CreateWebhookEndpointUseCase } from './application/use-cases/create-webhook-endpoint.usecase';
import { ListWebhookEndpointsUseCase } from './application/use-cases/list-webhook-endpoints.usecase';
import { DisableWebhookEndpointUseCase } from './application/use-cases/disable-webhook-endpoint.usecase';
import { PublishEventUseCase } from './application/use-cases/publish-event.usecase';
import { ListEventsUseCase } from './application/use-cases/list-events.usecase';
import { GetEventUseCase } from './application/use-cases/get-event.usecase';
import { DispatchWebhooksUseCase } from './application/use-cases/dispatch-webhooks.usecase';
import { WEBHOOK_REPOSITORY } from './domain/ports/webhook.repository';
import { WEBHOOK_SENDER } from './domain/ports/webhook-sender';
import { TypeOrmWebhookRepository } from './infrastructure/persistence/typeorm/typeorm-webhook.repository';
import { FetchWebhookSender } from './infrastructure/http/fetch-webhook-sender';
import { DispatchWebhooksJob } from './infrastructure/jobs/dispatch-webhooks.job';

@Module({
  imports: [IdempotencyModule, MerchantsModule],
  controllers: [WebhookEndpointsController, EventsController],
  providers: [
    CreateWebhookEndpointUseCase,
    ListWebhookEndpointsUseCase,
    DisableWebhookEndpointUseCase,
    PublishEventUseCase,
    ListEventsUseCase,
    GetEventUseCase,
    DispatchWebhooksUseCase,
    DispatchWebhooksJob,
    { provide: WEBHOOK_REPOSITORY, useClass: TypeOrmWebhookRepository },
    { provide: WEBHOOK_SENDER, useClass: FetchWebhookSender },
  ],
  exports: [PublishEventUseCase, DispatchWebhooksUseCase],
})
export class WebhooksModule {}
