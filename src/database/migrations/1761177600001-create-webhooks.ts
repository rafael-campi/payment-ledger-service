import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhooks1761177600001 implements MigrationInterface {
  name = 'CreateWebhooks1761177600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The secret signs deliveries, so it is stored retrievable (unlike API keys).
    await queryRunner.query(`
      CREATE TABLE webhook_endpoints (
        id          varchar(32)   PRIMARY KEY,
        merchant_id varchar(32)   NOT NULL REFERENCES merchants (id),
        url         varchar(2048) NOT NULL,
        secret      varchar(64)   NOT NULL,
        created_at  timestamptz   NOT NULL DEFAULT now(),
        disabled_at timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_webhook_endpoints_merchant ON webhook_endpoints (merchant_id)`,
    );

    // Transactional outbox (ADR 0003): written in the same transaction as the
    // state change it describes. Append-only, like every business fact.
    await queryRunner.query(`
      CREATE TABLE events (
        id          varchar(32) PRIMARY KEY,
        merchant_id varchar(32) NOT NULL REFERENCES merchants (id),
        type        varchar(64) NOT NULL,
        data        jsonb       NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_events_merchant_created ON events (merchant_id, created_at DESC)`,
    );
    await queryRunner.query(`
      CREATE TRIGGER events_append_only
      BEFORE UPDATE OR DELETE ON events
      FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation()
    `);

    // One row per (event, endpoint); the dispatcher leases due rows with SKIP LOCKED.
    await queryRunner.query(`
      CREATE TABLE webhook_deliveries (
        id                   uuid        PRIMARY KEY,
        event_id             varchar(32) NOT NULL REFERENCES events (id),
        endpoint_id          varchar(32) NOT NULL REFERENCES webhook_endpoints (id),
        status               varchar(16) NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'succeeded', 'failed')),
        attempts             int         NOT NULL DEFAULT 0,
        next_attempt_at      timestamptz NOT NULL DEFAULT now(),
        last_attempt_at      timestamptz,
        last_response_status int,
        last_error           text,
        CONSTRAINT uq_webhook_deliveries_event_endpoint UNIQUE (event_id, endpoint_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE status = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE webhook_deliveries`);
    await queryRunner.query(`DROP TABLE events`);
    await queryRunner.query(`DROP TABLE webhook_endpoints`);
  }
}
