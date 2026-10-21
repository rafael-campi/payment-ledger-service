import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

/** Authorization header for /platform and /ledger (token from .env.test). */
export const PLATFORM = `Bearer ${process.env.PLATFORM_ADMIN_TOKEN}`;

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();

  // migrations, not synchronize: the append-only and balance triggers live there
  const dataSource = app.get(DataSource);
  await dataSource.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await dataSource.runMigrations();

  return app;
}
