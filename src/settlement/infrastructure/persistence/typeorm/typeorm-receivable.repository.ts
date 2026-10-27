import { Injectable } from '@nestjs/common';
import { In, IsNull, Not } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { Receivable } from '../../../domain/entities/receivable.entity';
import { ReceivableRepository } from '../../../domain/ports/receivable.repository';
import { ReceivableRecord } from './settlement.records';

@Injectable()
export class TypeOrmReceivableRepository implements ReceivableRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async saveAll(receivables: Receivable[]): Promise<void> {
    if (receivables.length === 0) return;
    await this.uow.manager().insert(
      ReceivableRecord,
      receivables.map((r) => ({
        id: r.id,
        merchantId: r.merchantId,
        paymentId: r.paymentId,
        installment: r.installment,
        amount: r.amount,
        reversedAmount: r.reversedAmount,
        currency: r.currency,
        availableOn: r.availableOn,
        releasedAt: r.releasedAt,
        createdAt: r.createdAt,
      })),
    );
  }

  lockDue(now: Date, limit: number): Promise<Receivable[]> {
    return this.lockWhere(
      `released_at IS NULL AND available_on <= $1
       ORDER BY available_on LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );
  }

  lockUnreleased(paymentId: string): Promise<Receivable[]> {
    return this.lockWhere(
      `payment_id = $1 AND released_at IS NULL
       ORDER BY available_on DESC, installment DESC FOR UPDATE`,
      [paymentId],
    );
  }

  lockByIds(ids: string[]): Promise<Receivable[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.lockWhere(`id = ANY($1) FOR UPDATE`, [ids]);
  }

  async markReleased(id: string, at: Date): Promise<void> {
    await this.uow
      .manager()
      .update(ReceivableRecord, { id }, { releasedAt: at });
  }

  async addReversed(id: string, delta: number): Promise<void> {
    await this.uow
      .manager()
      .query(
        `UPDATE receivables SET reversed_amount = reversed_amount + $2 WHERE id = $1`,
        [id, delta],
      );
  }

  async listByMerchant(
    merchantId: string,
    filter: { released?: boolean; limit: number },
  ): Promise<Receivable[]> {
    const released =
      filter.released === undefined
        ? {}
        : { releasedAt: filter.released ? Not(IsNull()) : IsNull() };
    const records = await this.uow.manager().find(ReceivableRecord, {
      where: { merchantId, ...released },
      order: { availableOn: 'ASC', installment: 'ASC' },
      take: filter.limit,
    });
    return records.map(toDomain);
  }

  private async lockWhere(
    condition: string,
    params: unknown[],
  ): Promise<Receivable[]> {
    const rows: { id: string }[] = await this.uow
      .manager()
      .query(`SELECT id FROM receivables WHERE ${condition}`, params);
    if (rows.length === 0) return [];
    const records = await this.uow
      .manager()
      .findBy(ReceivableRecord, { id: In(rows.map((r) => r.id)) });
    const byId = new Map(records.map((r) => [r.id, toDomain(r)]));
    return rows.map((r) => byId.get(r.id)!);
  }
}

function toDomain(r: ReceivableRecord): Receivable {
  return new Receivable(
    r.id,
    r.merchantId,
    r.paymentId,
    r.installment,
    r.amount,
    r.reversedAmount,
    r.currency,
    r.availableOn,
    r.releasedAt,
    r.createdAt,
  );
}
