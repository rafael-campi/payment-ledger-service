import { Injectable } from '@nestjs/common';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { VaultedCard } from '../../../domain/entities/vaulted-card.entity';
import { VaultRepository } from '../../../domain/ports/vault.repository';
import { VaultCardRecord } from './vault.records';

@Injectable()
export class TypeOrmVaultRepository implements VaultRepository {
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async save(card: VaultedCard, panEncrypted: Buffer): Promise<void> {
    await this.uow.manager().insert(VaultCardRecord, {
      id: card.id,
      merchantId: card.merchantId,
      panEncrypted,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      holderName: card.holderName,
      createdAt: card.createdAt,
      expiresAt: card.expiresAt,
    });
  }

  async findById(merchantId: string, id: string): Promise<VaultedCard | null> {
    const record = await this.uow
      .manager()
      .findOneBy(VaultCardRecord, { id, merchantId });
    return record ? toDomain(record) : null;
  }

  async lockById(merchantId: string, id: string): Promise<VaultedCard | null> {
    const record = await this.uow.manager().findOne(VaultCardRecord, {
      where: { id, merchantId },
      lock: { mode: 'pessimistic_write' },
    });
    return record ? toDomain(record) : null;
  }

  async findEncryptedPan(id: string): Promise<Buffer | null> {
    const rows: { pan_encrypted: Buffer | null }[] = await this.uow
      .manager()
      .query(`SELECT pan_encrypted FROM vault_cards WHERE id = $1`, [id]);
    return rows[0]?.pan_encrypted ?? null;
  }

  async markRedeemed(id: string, paymentId: string, at: Date): Promise<void> {
    await this.uow
      .manager()
      .update(
        VaultCardRecord,
        { id },
        { redeemedByPayment: paymentId, redeemedAt: at },
      );
  }

  async purge(id: string, at: Date): Promise<void> {
    await this.uow.manager().query(
      `UPDATE vault_cards SET pan_encrypted = NULL, purged_at = $2
        WHERE id = $1 AND purged_at IS NULL`,
      [id, at],
    );
  }

  async purgeExpiredUnused(now: Date): Promise<number> {
    const [, count]: [unknown, number] = await this.uow.manager().query(
      `UPDATE vault_cards SET pan_encrypted = NULL, purged_at = $1
        WHERE purged_at IS NULL AND redeemed_by_payment IS NULL AND expires_at <= $1`,
      [now],
    );
    return count;
  }
}

function toDomain(record: VaultCardRecord): VaultedCard {
  return new VaultedCard(
    record.id,
    record.merchantId,
    record.brand,
    record.last4,
    record.expMonth,
    record.expYear,
    record.holderName,
    record.createdAt,
    record.expiresAt,
    record.redeemedByPayment,
    record.purgedAt,
  );
}
