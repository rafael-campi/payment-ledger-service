import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '../../../domain/entities/payment.entity';
import { PaymentRepository } from '../../../domain/ports/payment.repository';
import {
  CardChargeRecord,
  PaymentRecord,
  PixChargeRecord,
} from './payment.records';

const RELATIONS = { pix: true, card: true } as const;

@Injectable()
export class TypeOrmPaymentRepository implements PaymentRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async save(payment: Payment): Promise<void> {
    await this.uow.run(async () => {
      const manager = this.uow.manager();
      await manager.insert(PaymentRecord, {
        id: payment.id,
        merchantId: payment.merchantId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: payment.status,
        description: payment.description,
        metadata: payment.metadata,
        fee: payment.fee,
        failureCode: payment.failureCode,
        amountRefunded: payment.amountRefunded,
        expiresAt: payment.expiresAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });
      if (payment.pix) {
        await manager.insert(PixChargeRecord, {
          paymentId: payment.id,
          txid: payment.pix.txid,
          copiaECola: payment.pix.copiaECola,
          endToEndId: payment.pix.endToEndId,
          paidAt: payment.pix.paidAt,
        });
      }
      if (payment.card) {
        await manager.insert(CardChargeRecord, {
          paymentId: payment.id,
          ...payment.card,
        });
      }
    });
  }

  async update(payment: Payment): Promise<void> {
    await this.uow.run(async () => {
      const manager = this.uow.manager();
      await manager.update(
        PaymentRecord,
        { id: payment.id },
        {
          status: payment.status,
          failureCode: payment.failureCode,
          amountRefunded: payment.amountRefunded,
          updatedAt: payment.updatedAt,
        },
      );
      if (payment.pix) {
        await manager.update(
          PixChargeRecord,
          { paymentId: payment.id },
          { endToEndId: payment.pix.endToEndId, paidAt: payment.pix.paidAt },
        );
      }
      if (payment.card) {
        await manager.update(
          CardChargeRecord,
          { paymentId: payment.id },
          {
            authorizationId: payment.card.authorizationId,
            authorizedAt: payment.card.authorizedAt,
            capturedAt: payment.card.capturedAt,
          },
        );
      }
    });
  }

  async findById(merchantId: string, id: string): Promise<Payment | null> {
    const record = await this.uow.manager().findOne(PaymentRecord, {
      where: { id, merchantId },
      relations: RELATIONS,
    });
    return record ? toDomain(record) : null;
  }

  async listByMerchant(merchantId: string, limit: number): Promise<Payment[]> {
    const records = await this.uow.manager().find(PaymentRecord, {
      where: { merchantId },
      relations: RELATIONS,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return records.map(toDomain);
  }

  async findByTxid(txid: string): Promise<Payment | null> {
    const record = await this.uow.manager().findOne(PaymentRecord, {
      where: { pix: { txid } },
      relations: RELATIONS,
    });
    return record ? toDomain(record) : null;
  }

  async findStuckCardPayments(
    createdBefore: Date,
    limit: number,
  ): Promise<Payment[]> {
    const rows: { id: string }[] = await this.uow.manager().query(
      `SELECT id FROM payments
        WHERE method = 'credit_card' AND status = 'pending' AND created_at < $1
        ORDER BY created_at
        LIMIT $2`,
      [createdBefore, limit],
    );
    return this.loadAll(rows.map((r) => r.id));
  }

  async lockById(merchantId: string, id: string): Promise<Payment | null> {
    const ids = await this.lockIds(
      `SELECT id FROM payments WHERE id = $1 AND merchant_id = $2 FOR UPDATE`,
      [id, merchantId],
    );
    return (await this.loadAll(ids))[0] ?? null;
  }

  async lockByTxid(txid: string): Promise<Payment | null> {
    const ids = await this.lockIds(
      `SELECT p.id
         FROM payments p
         JOIN pix_charges c ON c.payment_id = p.id
        WHERE c.txid = $1
          FOR UPDATE OF p`,
      [txid],
    );
    return (await this.loadAll(ids))[0] ?? null;
  }

  async lockExpiredOpen(now: Date, limit: number): Promise<Payment[]> {
    const ids = await this.lockIds(
      `SELECT id
         FROM payments
        WHERE status IN ('pending', 'authorized') AND expires_at <= $1
        ORDER BY expires_at
        LIMIT $2
          FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );
    return this.loadAll(ids);
  }

  // locks come from raw SQL (TypeORM cannot express FOR UPDATE OF / SKIP LOCKED
  // together with relations); the rows are then loaded normally
  private async lockIds(sql: string, params: unknown[]): Promise<string[]> {
    const rows: { id: string }[] = await this.uow.manager().query(sql, params);
    return rows.map((r) => r.id);
  }

  private async loadAll(ids: string[]): Promise<Payment[]> {
    if (ids.length === 0) return [];
    const records = await this.uow.manager().find(PaymentRecord, {
      where: { id: In(ids) },
      relations: RELATIONS,
    });
    const byId = new Map(records.map((r) => [r.id, toDomain(r)]));
    return ids.map((id) => byId.get(id)!);
  }
}

function toDomain(record: PaymentRecord): Payment {
  return new Payment({
    id: record.id,
    merchantId: record.merchantId,
    amount: record.amount,
    currency: record.currency,
    method: record.method as PaymentMethod,
    status: record.status as PaymentStatus,
    description: record.description,
    metadata: record.metadata,
    fee: record.fee,
    pix: record.pix && {
      txid: record.pix.txid,
      copiaECola: record.pix.copiaECola,
      endToEndId: record.pix.endToEndId,
      paidAt: record.pix.paidAt,
    },
    card: record.card && {
      tokenId: record.card.tokenId,
      brand: record.card.brand,
      last4: record.card.last4,
      expMonth: record.card.expMonth,
      expYear: record.card.expYear,
      installments: record.card.installments,
      capture: record.card.capture,
      authorizationId: record.card.authorizationId,
      authorizedAt: record.card.authorizedAt,
      capturedAt: record.card.capturedAt,
    },
    failureCode: record.failureCode,
    amountRefunded: record.amountRefunded,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
