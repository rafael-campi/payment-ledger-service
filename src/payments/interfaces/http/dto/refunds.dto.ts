import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRefundDto {
  @Matches(/^pay_[0-9a-f]{24}$/, {
    message: 'payment must be a payment id (pay_...)',
  })
  payment!: string;

  /** In cents; defaults to everything not refunded yet. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ListRefundsQueryDto {
  @IsOptional()
  @Matches(/^pay_[0-9a-f]{24}$/)
  payment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
