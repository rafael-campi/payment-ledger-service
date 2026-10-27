import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedger1761004800000 implements MigrationInterface {
  name = 'CreateLedger1761004800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ledger_transactions (
        id                 uuid         PRIMARY KEY,
        description        varchar(255) NOT NULL,
        source             varchar(64)  NOT NULL,
        external_reference varchar(128) NOT NULL,
        created_at         timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_ledger_transactions_source_reference UNIQUE (source, external_reference)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id             uuid         PRIMARY KEY,
        transaction_id uuid         NOT NULL REFERENCES ledger_transactions (id),
        account_id     varchar(128) NOT NULL,
        amount         bigint       NOT NULL CHECK (amount <> 0),
        currency       char(3)      NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        created_at     timestamptz  NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_ledger_entries_transaction ON ledger_entries (transaction_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_ledger_entries_account ON ledger_entries (account_id, created_at)`,
    );

    // Append-only: corrections are new transactions, never mutations (ADR 0004).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ledger_reject_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'ledger is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of ['ledger_transactions', 'ledger_entries']) {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_append_only
        BEFORE UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation()
      `);
      await queryRunner.query(`
        CREATE TRIGGER ${table}_no_truncate
        BEFORE TRUNCATE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_mutation()
      `);
    }

    // Defense in depth: even a write that bypasses the domain cannot commit
    // an unbalanced or mixed-currency transaction.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ledger_check_balanced() RETURNS trigger AS $$
      DECLARE
        total      numeric;
        currencies int;
      BEGIN
        SELECT COALESCE(SUM(amount), 0), COUNT(DISTINCT currency)
          INTO total, currencies
          FROM ledger_entries
         WHERE transaction_id = NEW.transaction_id;
        IF total <> 0 THEN
          RAISE EXCEPTION 'ledger transaction % is not balanced (sum = %)', NEW.transaction_id, total;
        END IF;
        IF currencies > 1 THEN
          RAISE EXCEPTION 'ledger transaction % mixes currencies', NEW.transaction_id;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER ledger_entries_balanced
      AFTER INSERT ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE is not blocked by the append-only triggers (they cover UPDATE, DELETE, TRUNCATE)
    await queryRunner.query(`DROP TABLE ledger_entries`);
    await queryRunner.query(`DROP TABLE ledger_transactions`);
    await queryRunner.query(`DROP FUNCTION ledger_check_balanced()`);
    await queryRunner.query(`DROP FUNCTION ledger_reject_mutation()`);
  }
}
