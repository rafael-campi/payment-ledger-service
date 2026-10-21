import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1761004800001 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1761004800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        scope           varchar(64)  NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        request_hash    char(64)     NOT NULL,
        status          varchar(16)  NOT NULL CHECK (status IN ('in_progress', 'completed')),
        response_status int,
        response_body   jsonb,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, idempotency_key)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
  }
}
