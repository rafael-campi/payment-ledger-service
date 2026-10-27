import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCards1761264000000 implements MigrationInterface {
  name = 'CreateCards1761264000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE merchants
        ADD COLUMN card_fee_bps int NOT NULL DEFAULT 299
        CHECK (card_fee_bps BETWEEN 0 AND 10000)
    `);

    // Card Vault (ADR 0002): the only place a card number exists, encrypted
    // (AES-256-GCM: iv | tag | ciphertext) and wiped once the payment ends.
    // The CVC is validated at tokenization and never stored.
    await queryRunner.query(`
      CREATE TABLE vault_cards (
        id                  varchar(32) PRIMARY KEY,
        merchant_id         varchar(32) NOT NULL REFERENCES merchants (id),
        pan_encrypted       bytea,
        brand               varchar(16) NOT NULL,
        last4               char(4)     NOT NULL,
        exp_month           smallint    NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
        exp_year            smallint    NOT NULL,
        holder_name         varchar(64),
        created_at          timestamptz NOT NULL DEFAULT now(),
        expires_at          timestamptz NOT NULL,
        redeemed_by_payment varchar(32),
        redeemed_at         timestamptz,
        purged_at           timestamptz,
        CONSTRAINT ck_vault_cards_purged CHECK ((purged_at IS NULL) = (pan_encrypted IS NOT NULL))
      )
    `);

    await queryRunner.query(`
      ALTER TABLE payments
        DROP CONSTRAINT payments_method_check,
        ADD CONSTRAINT payments_method_check CHECK (method IN ('pix', 'credit_card')),
        DROP CONSTRAINT payments_status_check,
        ADD CONSTRAINT payments_status_check
          CHECK (status IN ('pending', 'authorized', 'succeeded', 'failed', 'expired', 'canceled')),
        ADD COLUMN failure_code varchar(32)
    `);
    await queryRunner.query(`DROP INDEX ix_payments_pending_expiry`);
    await queryRunner.query(
      `CREATE INDEX ix_payments_open_expiry ON payments (expires_at) WHERE status IN ('pending', 'authorized')`,
    );

    await queryRunner.query(`
      CREATE TABLE card_charges (
        payment_id       varchar(32) PRIMARY KEY REFERENCES payments (id),
        token_id         varchar(32) NOT NULL REFERENCES vault_cards (id),
        brand            varchar(16) NOT NULL,
        last4            char(4)     NOT NULL,
        exp_month        smallint    NOT NULL,
        exp_year         smallint    NOT NULL,
        installments     smallint    NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 12),
        capture          boolean     NOT NULL,
        authorization_id varchar(64),
        authorized_at    timestamptz,
        captured_at      timestamptz,
        CONSTRAINT uq_card_charges_token UNIQUE (token_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE card_charges`);
    await queryRunner.query(`DROP INDEX ix_payments_open_expiry`);
    await queryRunner.query(
      `CREATE INDEX ix_payments_pending_expiry ON payments (expires_at) WHERE status = 'pending'`,
    );
    await queryRunner.query(`
      ALTER TABLE payments
        DROP COLUMN failure_code,
        DROP CONSTRAINT payments_status_check,
        ADD CONSTRAINT payments_status_check
          CHECK (status IN ('pending', 'succeeded', 'failed', 'expired', 'canceled')),
        DROP CONSTRAINT payments_method_check,
        ADD CONSTRAINT payments_method_check CHECK (method IN ('pix'))
    `);
    await queryRunner.query(`DROP TABLE vault_cards`);
    await queryRunner.query(`ALTER TABLE merchants DROP COLUMN card_fee_bps`);
  }
}
