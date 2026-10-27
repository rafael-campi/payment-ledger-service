import { Inject, Injectable } from '@nestjs/common';
import { ApiKey, hashApiKey } from '../../domain/entities/api-key.entity';
import { API_KEY_REPOSITORY } from '../../domain/ports/api-key.repository';
import type { ApiKeyRepository } from '../../domain/ports/api-key.repository';

@Injectable()
export class AuthenticateApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  /** The active key matching the plaintext, or null. */
  async execute(plaintext: string): Promise<ApiKey | null> {
    const apiKey = await this.apiKeys.findByHash(hashApiKey(plaintext));
    return apiKey?.isActive ? apiKey : null;
  }
}
