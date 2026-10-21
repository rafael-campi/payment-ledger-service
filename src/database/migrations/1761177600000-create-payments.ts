import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1761177600000 implements MigrationInterface {
  name = 'CreatePayments1761177600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE merchants
        ADD COLUMN pix_fee_bps int NOT NULL DEFAULT 99
        CHECK (pix_fee_bps BETWEEN 0 AND 10000)
    `);

    // Payment = intent and process (mutable state); money lives in the ledger.
    await queryRunner.query(`
      CREATE TABLE payments (
        id          varchar(32)  PRIMARY KEY,
        merchant_id varchar(32)  NOT NULL REFERENCES merchants (id),
        amount      bigint       NOT NULL CHECK (amount > 0),
        currency    char(3)      NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        method      varchar(16)  NOT NULL CHECK (method IN ('pix')),
        status      varchar(16)  NOT NULL
                    CHECK (status IN ('pending', 'succeeded', 'failed', 'expired', 'canceled')),
        description varchar(255),
        metadata    jsonb        NOT NULL DEFAULT '{}',
        fee         bigint       NOT NULL CHECK (fee >= 0),
        expires_at  timestamptz  NOT NULL,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_payments_fee_within_amount CHECK (fee <= amount)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_payments_merchant_created ON payments (merchant_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_payments_pending_expiry ON payments (expires_at) WHERE status = 'pending'`,
    );

    await queryRunner.query(`
      CREATE TABLE pix_charges (
        payment_id    varchar(32) PRIMARY KEY REFERENCES payments (id),
        txid          varchar(35) NOT NULL CHECK (txid ~ '^[a-zA-Z0-9]{26,35}$'),
        copia_e_cola  text        NOT NULL,
        end_to_end_id varchar(32),
        paid_at       timestamptz,
        CONSTRAINT uq_pix_charges_txid UNIQUE (txid),
        CONSTRAINT uq_pix_charges_end_to_end_id UNIQUE (end_to_end_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE pix_charges`);
    await queryRunner.query(`DROP TABLE payments`);
    await queryRunner.query(`ALTER TABLE merchants DROP COLUMN pix_fee_bps`);
  }
}
