import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import {
  LedgerAccountRecord,
  LedgerEntryRecord,
  LedgerTransactionRecord,
} from '../ledger/infrastructure/persistence/typeorm/ledger.records';
import {
  ApiKeyRecord,
  MerchantRecord,
} from '../merchants/infrastructure/persistence/typeorm/merchant.records';
import {
  EventRecord,
  WebhookEndpointRecord,
} from '../webhooks/infrastructure/persistence/typeorm/webhook.records';
import { CreateLedger1761004800000 } from './migrations/1761004800000-create-ledger';
import { CreateIdempotencyKeys1761004800001 } from './migrations/1761004800001-create-idempotency-keys';
import { CreateLedgerAccounts1761091200000 } from './migrations/1761091200000-create-ledger-accounts';
import { CreateMerchants1761091200001 } from './migrations/1761091200001-create-merchants';
import { CreateWebhooks1761177600001 } from './migrations/1761177600001-create-webhooks';

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
    MerchantRecord,
    ApiKeyRecord,
    WebhookEndpointRecord,
    EventRecord,
  ],
  // listed explicitly so the same list works from ts-node, jest and dist/
  migrations: [
    CreateLedger1761004800000,
    CreateIdempotencyKeys1761004800001,
    CreateLedgerAccounts1761091200000,
    CreateMerchants1761091200001,
    CreateWebhooks1761177600001,
  ],
};

export default new DataSource(dataSourceOptions);
