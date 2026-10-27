import { Inject, Injectable } from '@nestjs/common';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { API_KEY_REPOSITORY } from '../../domain/ports/api-key.repository';
import type { ApiKeyRepository } from '../../domain/ports/api-key.repository';

@Injectable()
export class ListApiKeysUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  async execute(merchantId: string): Promise<ApiKey[]> {
    return this.apiKeys.listByMerchant(merchantId);
  }
}
