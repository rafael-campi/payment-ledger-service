import { Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { ApiKey, ApiKeyType } from '../../../domain/entities/api-key.entity';
import { ApiKeyRepository } from '../../../domain/ports/api-key.repository';
import { ApiKeyRecord } from './merchant.records';

@Injectable()
export class TypeOrmApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async save(apiKey: ApiKey): Promise<void> {
    await this.uow.manager().insert(ApiKeyRecord, {
      id: apiKey.id,
      merchantId: apiKey.merchantId,
      type: apiKey.type,
      keyHash: apiKey.keyHash,
      last4: apiKey.last4,
      createdAt: apiKey.createdAt,
      revokedAt: apiKey.revokedAt,
    });
  }

  async saveRevocation(apiKey: ApiKey): Promise<void> {
    await this.uow
      .manager()
      .update(
        ApiKeyRecord,
        { id: apiKey.id, revokedAt: IsNull() },
        { revokedAt: apiKey.revokedAt },
      );
  }

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const record = await this.uow
      .manager()
      .findOneBy(ApiKeyRecord, { keyHash });
    return record ? toDomain(record) : null;
  }

  async findById(merchantId: string, id: string): Promise<ApiKey | null> {
    const record = await this.uow
      .manager()
      .findOneBy(ApiKeyRecord, { id, merchantId });
    return record ? toDomain(record) : null;
  }

  async listByMerchant(merchantId: string): Promise<ApiKey[]> {
    const records = await this.uow.manager().find(ApiKeyRecord, {
      where: { merchantId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return records.map(toDomain);
  }

  countActive(merchantId: string, type: ApiKeyType): Promise<number> {
    return this.uow
      .manager()
      .countBy(ApiKeyRecord, { merchantId, type, revokedAt: IsNull() });
  }
}

function toDomain(record: ApiKeyRecord): ApiKey {
  return new ApiKey(
    record.id,
    record.merchantId,
    record.type as ApiKeyType,
    record.keyHash,
    record.last4,
    record.createdAt,
    record.revokedAt,
  );
}
