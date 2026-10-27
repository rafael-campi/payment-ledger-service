import { Column, Entity, PrimaryColumn, ValueTransformer } from 'typeorm';

const bigintAsNumber: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

@Entity('refunds')
export class RefundRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ name: 'payment_id', type: 'varchar', length: 32 })
  paymentId: string;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ name: 'from_pending', type: 'bigint', transformer: bigintAsNumber })
  fromPending: number;

  @Column({
    name: 'from_available',
    type: 'bigint',
    transformer: bigintAsNumber,
  })
  fromAvailable: number;

  @Column({ name: 'receivable_reversals', type: 'jsonb' })
  reversals: { receivableId: string; amount: number }[];

  @Column({
    name: 'rail_reference',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  railReference: string | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 32, nullable: true })
  failureCode: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
