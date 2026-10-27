import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  ValueTransformer,
} from 'typeorm';

// pg returns bigint as string; amounts are always safe integers (see validateDoubleEntry)
const bigintAsNumber: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

@Entity('ledger_transactions')
export class LedgerTransactionRecord {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 64 })
  source: string;

  @Column({ name: 'external_reference', type: 'varchar', length: 128 })
  externalReference: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => LedgerEntryRecord, (entry) => entry.transaction)
  entries: LedgerEntryRecord[];
}

@Entity('ledger_entries')
export class LedgerEntryRecord {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => LedgerTransactionRecord, (tx) => tx.entries)
  @JoinColumn({ name: 'transaction_id' })
  transaction: LedgerTransactionRecord;

  @Column({ name: 'account_id', type: 'varchar', length: 128 })
  accountId: string;

  @Column({ type: 'bigint', transformer: bigintAsNumber })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('ledger_accounts')
export class LedgerAccountRecord {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id: string;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
