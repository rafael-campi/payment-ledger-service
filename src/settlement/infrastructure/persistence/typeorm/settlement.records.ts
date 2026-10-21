import { Column, Entity, PrimaryColumn, ValueTransformer } from 'typeorm';

// pg returns bigint as string; amounts are bounded well below 2^53
const bigintAsNumber: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

@Entity('receivables')
export class ReceivableRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ name: 'payment_id', type: 'varchar', length: 32 })
  paymentId: string;

  @Column({ type: 'smallint' })
  installment: number;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  amount: number;

  @Column({
    name: 'reversed_amount',
    type: 'bigint',
    transformer: bigintAsNumber,
  })
  reversedAmount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'available_on', type: 'timestamptz' })
  availableOn: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('payouts')
export class PayoutRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'pix_key', type: 'varchar', length: 77 })
  pixKey: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({
    name: 'end_to_end_id',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  endToEndId: string | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 32, nullable: true })
  failureCode: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
