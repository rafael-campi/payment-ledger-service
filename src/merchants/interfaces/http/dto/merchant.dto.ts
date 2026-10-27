import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiKey, ApiKeyType } from '../../../domain/entities/api-key.entity';
import { Merchant } from '../../../domain/entities/merchant.entity';
import type { OnboardedMerchant } from '../../../application/use-cases/onboard-merchant.usecase';

export class OnboardMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  /** MDR on Pix in basis points; defaults to 99 (0.99%). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  pixFeeBps?: number;

  /** MDR on credit card in basis points; defaults to 299 (2.99%). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  cardFeeBps?: number;
}

export class UpdateAccountDto {
  /** Pix key that receives payouts: CPF, CNPJ, e-mail, +55 phone or random key. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(77)
  payoutPixKey!: string;
}

export class CreateApiKeyDto {
  @IsEnum(ApiKeyType)
  type!: ApiKeyType;
}

export class MerchantDto {
  id!: string;
  name!: string;
  pixFeeBps!: number;
  cardFeeBps!: number;
  payoutPixKey!: string | null;
  createdAt!: Date;

  static from(merchant: Merchant): MerchantDto {
    return {
      id: merchant.id,
      name: merchant.name,
      pixFeeBps: merchant.pixFeeBps,
      cardFeeBps: merchant.cardFeeBps,
      payoutPixKey: merchant.payoutPixKey,
      createdAt: merchant.createdAt,
    };
  }
}

export class ApiKeyDto {
  id!: string;
  type!: ApiKeyType;
  /** Masked ("sk_test_…a1b2"), except in the response that creates the key. */
  key!: string;
  createdAt!: Date;
  revokedAt!: Date | null;

  static from(apiKey: ApiKey, plaintext?: string): ApiKeyDto {
    return {
      id: apiKey.id,
      type: apiKey.type,
      key: plaintext ?? apiKey.masked,
      createdAt: apiKey.createdAt,
      revokedAt: apiKey.revokedAt,
    };
  }

  /** For idempotent replays: the plaintext is never stored. */
  static masked(dto: ApiKeyDto): ApiKeyDto {
    return { ...dto, key: `${dto.key.slice(0, 8)}…${dto.key.slice(-4)}` };
  }
}

export class OnboardedMerchantDto extends MerchantDto {
  apiKeys!: ApiKeyDto[];

  static fromOnboarded({
    merchant,
    secretKey,
    publishableKey,
  }: OnboardedMerchant): OnboardedMerchantDto {
    return {
      ...MerchantDto.from(merchant),
      apiKeys: [
        ApiKeyDto.from(secretKey.apiKey, secretKey.plaintext),
        ApiKeyDto.from(publishableKey.apiKey, publishableKey.plaintext),
      ],
    };
  }

  static masked(dto: OnboardedMerchantDto): OnboardedMerchantDto {
    return { ...dto, apiKeys: dto.apiKeys.map((k) => ApiKeyDto.masked(k)) };
  }
}

export class BalanceDto {
  available!: { amount: number; currency: string }[];
  pending!: { amount: number; currency: string }[];
}
