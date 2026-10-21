import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PostLedgerEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  accountId!: string;

  @IsInt()
  amount!: number; // smallest unit (cents); positive = debit, negative = credit

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code' })
  currency!: string;
}

export class PostLedgerTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;

  @Matches(/^[a-z][a-z0-9_.-]{0,63}$/, {
    message: 'source must be a lowercase identifier (e.g. "pix", "manual")',
  })
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalReference!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PostLedgerEntryDto)
  entries!: PostLedgerEntryDto[];
}
