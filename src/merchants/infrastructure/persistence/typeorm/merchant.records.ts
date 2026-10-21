import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('merchants')
export class MerchantRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'pix_fee_bps', type: 'int' })
  pixFeeBps: number;

  @Column({ name: 'card_fee_bps', type: 'int' })
  cardFeeBps: number;

  @Column({
    name: 'payout_pix_key',
    type: 'varchar',
    length: 77,
    nullable: true,
  })
  payoutPixKey: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('api_keys')
export class ApiKeyRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  @Column({ name: 'key_hash', type: 'char', length: 64 })
  keyHash: string;

  @Column({ type: 'varchar', length: 4 })
  last4: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
