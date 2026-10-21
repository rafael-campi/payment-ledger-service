import { Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { Payout, PayoutStatus } from '../../../domain/entities/payout.entity';
import { PayoutRepository } from '../../../domain/ports/payout.repository';
import { PayoutRecord } from './settlement.records';

@Injectable()
export class TypeOrmPayoutRepository implements PayoutRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async save(payout: Payout): Promise<void> {
    await this.uow.manager().insert(PayoutRecord, { ...payout });
  }

  async update(payout: Payout): Promise<void> {
    await this.uow.manager().update(
      PayoutRecord,
      { id: payout.id },
      {
        status: payout.status,
        endToEndId: payout.endToEndId,
        failureCode: payout.failureCode,
        updatedAt: payout.updatedAt,
      },
    );
  }

  async lockMerchant(merchantId: string): Promise<void> {
    // a transaction-scoped advisory lock: payouts of one merchant run one at a time
    await this.uow
      .manager()
      .query(`SELECT pg_advisory_xact_lock(hashtext('payout:' || $1))`, [
        merchantId,
      ]);
  }

  async lockById(id: string): Promise<Payout | null> {
    const record = await this.uow.manager().findOne(PayoutRecord, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return record ? toDomain(record) : null;
  }

  async findById(merchantId: string, id: string): Promise<Payout | null> {
    const record = await this.uow
      .manager()
      .findOneBy(PayoutRecord, { id, merchantId });
    return record ? toDomain(record) : null;
  }

  async listByMerchant(merchantId: string, limit: number): Promise<Payout[]> {
    const records = await this.uow.manager().find(PayoutRecord, {
      where: { merchantId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return records.map(toDomain);
  }

  async findStuckPending(
    createdBefore: Date,
    limit: number,
  ): Promise<Payout[]> {
    const records = await this.uow.manager().find(PayoutRecord, {
      where: {
        status: PayoutStatus.PENDING,
        createdAt: LessThan(createdBefore),
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return records.map(toDomain);
  }
}

function toDomain(r: PayoutRecord): Payout {
  return new Payout(
    r.id,
    r.merchantId,
    r.amount,
    r.currency,
    r.pixKey,
    r.status as PayoutStatus,
    r.endToEndId,
    r.failureCode,
    r.createdAt,
    r.updatedAt,
  );
}
