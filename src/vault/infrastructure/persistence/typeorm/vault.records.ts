import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('vault_cards')
export class VaultCardRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  // never selected by default: only findEncryptedPan reads it
  @Column({
    name: 'pan_encrypted',
    type: 'bytea',
    nullable: true,
    select: false,
  })
  panEncrypted: Buffer | null;

  @Column({ type: 'varchar', length: 16 })
  brand: string;

  @Column({ type: 'char', length: 4 })
  last4: string;

  @Column({ name: 'exp_month', type: 'smallint' })
  expMonth: number;

  @Column({ name: 'exp_year', type: 'smallint' })
  expYear: number;

  @Column({ name: 'holder_name', type: 'varchar', length: 64, nullable: true })
  holderName: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({
    name: 'redeemed_by_payment',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  redeemedByPayment: string | null;

  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt: Date | null;

  @Column({ name: 'purged_at', type: 'timestamptz', nullable: true })
  purgedAt: Date | null;
}
