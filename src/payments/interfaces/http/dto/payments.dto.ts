import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../domain/entities/payment.entity';

export class PaymentCardDto {
  /** From POST /v1/tokens (single use). */
  @Matches(/^tok_[0-9a-f]{24}$/, {
    message: 'card.token must be a card token (tok_...)',
  })
  token!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;
}

export class CreatePaymentDto {
  /** In cents. Up to R$ 10 million. */
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** Up to 20 string values the merchant gets back untouched (e.g. its order id). */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** How long the Pix charge can be paid; 1 minute to 24 hours, default 1 hour. */
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  expiresInSeconds?: number;

  /** Required with method "credit_card". */
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentCardDto)
  card?: PaymentCardDto;

  /** Credit card only: false authorizes now and captures later. Default true. */
  @IsOptional()
  @IsBoolean()
  capture?: boolean;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
