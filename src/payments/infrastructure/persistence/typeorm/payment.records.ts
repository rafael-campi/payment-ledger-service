import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  ValueTransformer,
} from 'typeorm';

// pg returns bigint as string; payment amounts are bounded well below 2^53
const bigintAsNumber: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

@Entity('payments')
export class PaymentRecord {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 32 })
  merchantId: string;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 16 })
  method: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'jsonb' })
  metadata: Record<string, string>;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  fee: number;

  @Column({ name: 'failure_code', type: 'varchar', length: 32, nullable: true })
  failureCode: string | null;

  @Column({
    name: 'amount_refunded',
    type: 'bigint',
    transformer: bigintAsNumber,
  })
  amountRefunded: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => PixChargeRecord, (charge) => charge.payment)
  pix: PixChargeRecord | null;

  @OneToOne(() => CardChargeRecord, (charge) => charge.payment)
  card: CardChargeRecord | null;
}

@Entity('pix_charges')
export class PixChargeRecord {
  @PrimaryColumn({ name: 'payment_id', type: 'varchar', length: 32 })
  paymentId: string;

  @OneToOne(() => PaymentRecord, (payment) => payment.pix)
  @JoinColumn({ name: 'payment_id' })
  payment: PaymentRecord;

  @Column({ type: 'varchar', length: 35 })
  txid: string;

  @Column({ name: 'copia_e_cola', type: 'text' })
  copiaECola: string;

  @Column({
    name: 'end_to_end_id',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  endToEndId: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}

@Entity('card_charges')
export class CardChargeRecord {
  @PrimaryColumn({ name: 'payment_id', type: 'varchar', length: 32 })
  paymentId: string;

  @OneToOne(() => PaymentRecord, (payment) => payment.card)
  @JoinColumn({ name: 'payment_id' })
  payment: PaymentRecord;

  @Column({ name: 'token_id', type: 'varchar', length: 32 })
  tokenId: string;

  @Column({ type: 'varchar', length: 16 })
  brand: string;

  @Column({ type: 'char', length: 4 })
  last4: string;

  @Column({ name: 'exp_month', type: 'smallint' })
  expMonth: number;

  @Column({ name: 'exp_year', type: 'smallint' })
  expYear: number;

  @Column({ type: 'smallint' })
  installments: number;

  @Column({ type: 'boolean' })
  capture: boolean;

  @Column({
    name: 'authorization_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  authorizationId: string | null;

  @Column({ name: 'authorized_at', type: 'timestamptz', nullable: true })
  authorizedAt: Date | null;

  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;
}
