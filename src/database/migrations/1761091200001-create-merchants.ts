import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchants1761091200001 implements MigrationInterface {
  name = 'CreateMerchants1761091200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE merchants (
        id         varchar(32)  PRIMARY KEY,
        name       varchar(255) NOT NULL,
        created_at timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // Only the SHA-256 of each key is stored; the plaintext is shown once.
    await queryRunner.query(`
      CREATE TABLE api_keys (
        id          varchar(32) PRIMARY KEY,
        merchant_id varchar(32) NOT NULL REFERENCES merchants (id),
        type        varchar(16) NOT NULL CHECK (type IN ('secret', 'publishable')),
        key_hash    char(64)    NOT NULL,
        last4       varchar(4)  NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        revoked_at  timestamptz,
        CONSTRAINT uq_api_keys_key_hash UNIQUE (key_hash)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_api_keys_merchant ON api_keys (merchant_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE api_keys`);
    await queryRunner.query(`DROP TABLE merchants`);
  }
}
