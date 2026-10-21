import { Injectable } from '@nestjs/common';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { Merchant } from '../../../domain/entities/merchant.entity';
import { MerchantRepository } from '../../../domain/ports/merchant.repository';
import { MerchantRecord } from './merchant.records';

@Injectable()
export class TypeOrmMerchantRepository implements MerchantRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async save(merchant: Merchant): Promise<void> {
    await this.uow.manager().insert(MerchantRecord, {
      id: merchant.id,
      name: merchant.name,
      pixFeeBps: merchant.pixFeeBps,
      cardFeeBps: merchant.cardFeeBps,
      createdAt: merchant.createdAt,
    });
  }

  async updatePayoutPixKey(id: string, pixKey: string): Promise<void> {
    await this.uow
      .manager()
      .update(MerchantRecord, { id }, { payoutPixKey: pixKey });
  }

  async findById(id: string): Promise<Merchant | null> {
    const record = await this.uow.manager().findOneBy(MerchantRecord, { id });
    return record ? toDomain(record) : null;
  }

  async lockById(id: string): Promise<Merchant | null> {
    const record = await this.uow.manager().findOne(MerchantRecord, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return record ? toDomain(record) : null;
  }
}

function toDomain(record: MerchantRecord): Merchant {
  return new Merchant(
    record.id,
    record.name,
    record.pixFeeBps,
    record.cardFeeBps,
    record.createdAt,
    record.payoutPixKey,
  );
}
