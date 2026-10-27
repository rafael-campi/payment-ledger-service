import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedgerAccounts1761091200000 implements MigrationInterface {
  name = 'CreateLedgerAccounts1761091200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ledger_accounts (
        id         varchar(128) PRIMARY KEY,
        type       varchar(16)  NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE')),
        currency   char(3)      NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        created_at timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_ledger_accounts_id_currency UNIQUE (id, currency)
      )
    `);

    // An account's type and currency are facts entries depend on: never change them.
    await queryRunner.query(`
      CREATE TRIGGER ledger_accounts_append_only
      BEFORE UPDATE OR DELETE ON ledger_accounts
      FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation()
    `);
    await queryRunner.query(`
      CREATE TRIGGER ledger_accounts_no_truncate
      BEFORE TRUNCATE ON ledger_accounts
      FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_mutation()
    `);

    // Chart of accounts (copilot_prompt.md); merchant accounts are opened on onboarding.
    await queryRunner.query(`
      INSERT INTO ledger_accounts (id, type, currency) VALUES
        ('pix-settlement',      'ASSET',     'BRL'),
        ('acquirer-receivable', 'ASSET',     'BRL'),
        ('bank',                'ASSET',     'BRL'),
        ('payout-in-transit',   'LIABILITY', 'BRL'),
        ('fee-revenue',         'REVENUE',   'BRL'),
        ('rail-costs',          'EXPENSE',   'BRL'),
        ('suspense',            'LIABILITY', 'BRL')
    `);

    // Entries may only touch existing accounts, in the account's own currency.
    await queryRunner.query(`
      ALTER TABLE ledger_entries
        ADD CONSTRAINT fk_ledger_entries_account
        FOREIGN KEY (account_id, currency) REFERENCES ledger_accounts (id, currency)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ledger_entries DROP CONSTRAINT fk_ledger_entries_account`,
    );
    await queryRunner.query(`DROP TABLE ledger_accounts`);
  }
}
