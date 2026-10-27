import { Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { Refund, RefundStatus } from '../../../domain/entities/refund.entity';
import { RefundRepository } from '../../../domain/ports/refund.repository';
import { RefundRecord } from './refund.records';

@Injectable()
export class TypeOrmRefundRepository implements RefundRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async save(refund: Refund): Promise<void> {
    await this.uow.manager().insert(RefundRecord, { ...refund });
  }

  async update(refund: Refund): Promise<void> {
    await this.uow.manager().update(
      RefundRecord,
      { id: refund.id },
      {
        status: refund.status,
        railReference: refund.railReference,
        failureCode: refund.failureCode,
        updatedAt: refund.updatedAt,
      },
    );
  }

  async lockById(id: string): Promise<Refund | null> {
    const record = await this.uow.manager().findOne(RefundRecord, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return record ? toDomain(record) : null;
  }

  async findById(merchantId: string, id: string): Promise<Refund | null> {
    const record = await this.uow
      .manager()
      .findOneBy(RefundRecord, { id, merchantId });
    return record ? toDomain(record) : null;
  }

  async listByMerchant(
    merchantId: string,
    filter: { paymentId?: string; limit: number },
  ): Promise<Refund[]> {
    const records = await this.uow.manager().find(RefundRecord, {
      where: {
        merchantId,
        ...(filter.paymentId ? { paymentId: filter.paymentId } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: filter.limit,
    });
    return records.map(toDomain);
  }

  async findStuckPending(
    createdBefore: Date,
    limit: number,
  ): Promise<Refund[]> {
    const records = await this.uow.manager().find(RefundRecord, {
      where: {
        status: RefundStatus.PENDING,
        createdAt: LessThan(createdBefore),
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return records.map(toDomain);
  }
}

function toDomain(r: RefundRecord): Refund {
  return new Refund({ ...r, status: r.status as RefundStatus });
}
