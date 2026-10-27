import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { VaultedCard } from '../../../domain/entities/vaulted-card.entity';

// format checks only; the vault validates the card itself (Luhn, expiry, brand).
// class-validator messages never include the submitted value.
export class CardDto {
  @Matches(/^[0-9 -]{12,23}$/, {
    message: 'card.number must be 12 to 19 digits',
  })
  number!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expMonth!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  expYear!: number;

  @Matches(/^\d{3,4}$/, { message: 'card.cvc must be 3 or 4 digits' })
  cvc!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  holderName?: string;
}

export class TokenizeCardDto {
  @ValidateNested()
  @Type(() => CardDto)
  card!: CardDto;
}

export class TokenDto {
  id!: string;
  card!: { brand: string; last4: string; expMonth: number; expYear: number };
  expiresAt!: Date;
  createdAt!: Date;

  static from(card: VaultedCard): TokenDto {
    return {
      id: card.id,
      card: {
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
      },
      expiresAt: card.expiresAt,
      createdAt: card.createdAt,
    };
  }
}
