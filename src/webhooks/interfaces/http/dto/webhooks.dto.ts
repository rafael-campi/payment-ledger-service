import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WebhookEndpoint } from '../../../domain/entities/webhook-endpoint.entity';
import { WebhookEvent } from '../../../domain/entities/event.entity';

export class CreateWebhookEndpointDto {
  // require_tld off so local development (http://localhost:3000) works.
  // A production PSP must also refuse private and link-local addresses (SSRF).
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  url!: string;
}

export class ListEventsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class WebhookEndpointDto {
  id!: string;
  url!: string;
  /** Full secret only in the response that creates the endpoint. */
  secret!: string;
  createdAt!: Date;
  disabledAt!: Date | null;

  static from(
    endpoint: WebhookEndpoint,
    revealSecret = false,
  ): WebhookEndpointDto {
    return {
      id: endpoint.id,
      url: endpoint.url,
      secret: revealSecret ? endpoint.secret : endpoint.maskedSecret,
      createdAt: endpoint.createdAt,
      disabledAt: endpoint.disabledAt,
    };
  }

  /** For idempotent replays: the secret is never stored outside its table. */
  static masked(dto: WebhookEndpointDto): WebhookEndpointDto {
    return { ...dto, secret: `whsec_…${dto.secret.slice(-4)}` };
  }
}

export class EventDto {
  id!: string;
  type!: string;
  createdAt!: Date;
  data!: { object: unknown };

  static from(event: WebhookEvent): EventDto {
    return {
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      data: event.data,
    };
  }
}
