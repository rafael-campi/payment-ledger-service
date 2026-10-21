import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSettlement1761350400000 implements MigrationInterface {
  name = 'CreateSettlement1761350400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Outgoing money is recorded before the rail is called (copilot_prompt.md):
    // refunds wait here, as payouts wait in payout-in-transit.
    await queryRunner.query(`
      INSERT INTO ledger_accounts (id, type, currency)
      VALUES ('refund-in-transit', 'LIABILITY', 'BRL')
    `);

    await queryRunner.query(`
      ALTER TABLE merchants ADD COLUMN payout_pix_key varchar(77)
    `);

    await queryRunner.query(`
      ALTER TABLE payments
        DROP CONSTRAINT payments_status_check,
        ADD CONSTRAINT payments_status_check CHECK (status IN
          ('pending', 'authorized', 'succeeded', 'refunded', 'failed', 'expired', 'canceled')),
        ADD COLUMN amount_refunded bigint NOT NULL DEFAULT 0,
        ADD CONSTRAINT ck_payments_refund_within_amount
          CHECK (amount_refunded BETWEEN 0 AND amount)
    `);

    // Receivables schedule: when each part of a payment's net amount moves
    // from the merchant's pending balance to available (D+0 Pix, D+30 per
    // card installment). Refunds take from what is not released yet.
    await queryRunner.query(`
      CREATE TABLE receivables (
        id              varchar(32) PRIMARY KEY,
        merchant_id     varchar(32) NOT NULL REFERENCES merchants (id),
        payment_id      varchar(32) NOT NULL REFERENCES payments (id),
        installment     smallint    NOT NULL,
        amount          bigint      NOT NULL CHECK (amount > 0),
        reversed_amount bigint      NOT NULL DEFAULT 0,
        currency        char(3)     NOT NULL,
        available_on    timestamptz NOT NULL,
        released_at     timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_receivables_reversed CHECK (reversed_amount BETWEEN 0 AND amount),
        CONSTRAINT uq_receivables_installment UNIQUE (payment_id, installment)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_receivables_due ON receivables (available_on) WHERE released_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_receivables_merchant ON receivables (merchant_id, available_on)`,
    );
    // Payments that succeeded before the schedule existed: their net amount
    // is in merchant:pending with nothing to release it. Release it now.
    await queryRunner.query(`
      INSERT INTO receivables (id, merchant_id, payment_id, installment, amount, currency, available_on)
      SELECT 'rcv_' || substr(md5(p.id), 1, 24), p.merchant_id, p.id, 1,
             p.amount - p.fee, p.currency, now()
        FROM payments p
       WHERE p.status = 'succeeded' AND p.amount > p.fee
    `);

    await queryRunner.query(`
      CREATE TABLE refunds (
        id             varchar(32) PRIMARY KEY,
        merchant_id    varchar(32) NOT NULL REFERENCES merchants (id),
        payment_id     varchar(32) NOT NULL REFERENCES payments (id),
        amount         bigint      NOT NULL CHECK (amount > 0),
        currency       char(3)     NOT NULL,
        status         varchar(16) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
        reason         varchar(255),
        -- how the merchant funded it, to undo exactly that if the rail refuses
        from_pending   bigint      NOT NULL,
        from_available bigint      NOT NULL,
        receivable_reversals jsonb NOT NULL DEFAULT '[]',
        rail_reference varchar(64),
        failure_code   varchar(32),
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_refunds_funded CHECK (from_pending + from_available = amount)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_refunds_payment ON refunds (payment_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE payouts (
        id             varchar(32) PRIMARY KEY,
        merchant_id    varchar(32) NOT NULL REFERENCES merchants (id),
        amount         bigint      NOT NULL CHECK (amount > 0),
        currency       char(3)     NOT NULL,
        pix_key        varchar(77) NOT NULL,
        status         varchar(16) NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
        end_to_end_id  varchar(32),
        failure_code   varchar(32),
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_payouts_merchant ON payouts (merchant_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE payouts`);
    await queryRunner.query(`DROP TABLE refunds`);
    await queryRunner.query(`DROP TABLE receivables`);
    await queryRunner.query(`
      ALTER TABLE payments
        DROP CONSTRAINT ck_payments_refund_within_amount,
        DROP COLUMN amount_refunded,
        DROP CONSTRAINT payments_status_check,
        ADD CONSTRAINT payments_status_check CHECK (status IN
          ('pending', 'authorized', 'succeeded', 'failed', 'expired', 'canceled'))
    `);
    await queryRunner.query(`ALTER TABLE merchants DROP COLUMN payout_pix_key`);
    // ledger accounts are append-only: refund-in-transit stays (and stays empty)
  }
}
