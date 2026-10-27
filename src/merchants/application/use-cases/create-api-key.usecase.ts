import { Inject, Injectable } from '@nestjs/common';
import { ApiKey, ApiKeyType } from '../../domain/entities/api-key.entity';
import { API_KEY_REPOSITORY } from '../../domain/ports/api-key.repository';
import type { ApiKeyRepository } from '../../domain/ports/api-key.repository';
import type { IssuedKey } from './onboard-merchant.usecase';

@Injectable()
export class CreateApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  /** Lets a merchant roll keys: create the new one, deploy it, revoke the old. */
  async execute(merchantId: string, type: ApiKeyType): Promise<IssuedKey> {
    const issued = ApiKey.issue(merchantId, type, new Date());
    await this.apiKeys.save(issued.apiKey);
    return issued;
  }
}
