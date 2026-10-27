import { ApiKey, ApiKeyType } from '../entities/api-key.entity';

export const API_KEY_REPOSITORY = Symbol('API_KEY_REPOSITORY');

export interface ApiKeyRepository {
  save(apiKey: ApiKey): Promise<void>;
  saveRevocation(apiKey: ApiKey): Promise<void>;
  findByHash(keyHash: string): Promise<ApiKey | null>;
  /** Scoped by merchant: another merchant's key is reported as missing. */
  findById(merchantId: string, id: string): Promise<ApiKey | null>;
  listByMerchant(merchantId: string): Promise<ApiKey[]>;
  countActive(merchantId: string, type: ApiKeyType): Promise<number>;
}
