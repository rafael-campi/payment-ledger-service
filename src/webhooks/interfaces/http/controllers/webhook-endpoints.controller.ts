import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentMerchantId } from '../../../../shared/auth/principal';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { MerchantAuthGuard } from '../../../../merchants/interfaces/http/merchant-auth.guard';
import { CreateWebhookEndpointUseCase } from '../../../application/use-cases/create-webhook-endpoint.usecase';
import { ListWebhookEndpointsUseCase } from '../../../application/use-cases/list-webhook-endpoints.usecase';
import { DisableWebhookEndpointUseCase } from '../../../application/use-cases/disable-webhook-endpoint.usecase';
import {
  CreateWebhookEndpointDto,
  WebhookEndpointDto,
} from '../dto/webhooks.dto';

@Controller('v1/webhook_endpoints')
@UseGuards(MerchantAuthGuard)
export class WebhookEndpointsController {
  constructor(
    private readonly createEndpoint: CreateWebhookEndpointUseCase,
    private readonly listEndpoints: ListWebhookEndpointsUseCase,
    private readonly disableEndpoint: DisableWebhookEndpointUseCase,
  ) {}

  @Get()
  async list(
    @CurrentMerchantId() merchantId: string,
  ): Promise<WebhookEndpointDto[]> {
    const endpoints = await this.listEndpoints.execute(merchantId);
    return endpoints.map((e) => WebhookEndpointDto.from(e));
  }

  @Post()
  @Idempotent({
    storeAs: (body) => WebhookEndpointDto.masked(body as WebhookEndpointDto),
  })
  async create(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: CreateWebhookEndpointDto,
  ): Promise<WebhookEndpointDto> {
    const endpoint = await this.createEndpoint.execute(merchantId, dto.url);
    return WebhookEndpointDto.from(endpoint, true);
  }

  @Delete(':id')
  @Idempotent()
  async disable(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<WebhookEndpointDto> {
    return WebhookEndpointDto.from(
      await this.disableEndpoint.execute(merchantId, id),
    );
  }
}
