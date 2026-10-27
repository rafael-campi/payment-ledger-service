import { Inject, Injectable } from '@nestjs/common';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { ApiKey, ApiKeyType } from '../../domain/entities/api-key.entity';
import { MERCHANT_REPOSITORY } from '../../domain/ports/merchant.repository';
import type { MerchantRepository } from '../../domain/ports/merchant.repository';
import { API_KEY_REPOSITORY } from '../../domain/ports/api-key.repository';
import type { ApiKeyRepository } from '../../domain/ports/api-key.repository';

@Injectable()
export class RevokeApiKeyUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(MERCHANT_REPOSITORY) private readonly merchants: MerchantRepository,
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
  ) {}

  /** Idempotent. Refuses to revoke the last secret key, which would lock the merchant out. */
  async execute(merchantId: string, keyId: string): Promise<ApiKey> {
    return this.uow.run(async () => {
      // two concurrent revocations must not both see "another key still active"
      await this.merchants.lockById(merchantId);

      const apiKey = await this.apiKeys.findById(merchantId, keyId);
      if (!apiKey) {
        throw new NotFoundError(
          'merchants.api_key_not_found',
          `API key ${keyId} does not exist.`,
        );
      }
      if (!apiKey.isActive) return apiKey;

      if (
        apiKey.type === ApiKeyType.SECRET &&
        (await this.apiKeys.countActive(merchantId, ApiKeyType.SECRET)) <= 1
      ) {
        throw new DomainError(
          'merchants.last_secret_key',
          'Create another secret key before revoking the last one.',
        );
      }

      const revoked = apiKey.revoke(new Date());
      await this.apiKeys.saveRevocation(revoked);
      return revoked;
    });
  }
}
