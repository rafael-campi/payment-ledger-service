import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import {
  LedgerAccountRecord,
  LedgerEntryRecord,
  LedgerTransactionRecord,
} from '../ledger/infrastructure/persistence/typeorm/ledger.records';
import { CreateLedger1761004800000 } from './migrations/1761004800000-create-ledger';
import { CreateIdempotencyKeys1761004800001 } from './migrations/1761004800001-create-idempotency-keys';
import { CreateLedgerAccounts1761091200000 } from './migrations/1761091200000-create-ledger-accounts';

// does not override variables already set (e.g. by test/setup-env.ts)
dotenv.config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  entities: [
    LedgerTransactionRecord,
    LedgerEntryRecord,
    LedgerAccountRecord,
  ],
  // listed explicitly so the same list works from ts-node, jest and dist/
  migrations: [
    CreateLedger1761004800000,
    CreateIdempotencyKeys1761004800001,
    CreateLedgerAccounts1761091200000,
  ],
};

export default new DataSource(dataSourceOptions);
