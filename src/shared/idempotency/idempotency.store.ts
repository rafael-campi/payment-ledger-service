import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type Claim =
  | { kind: 'claimed' }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' }
  | { kind: 'completed'; status: number; body: unknown };

// Like Stripe, a key is remembered for 24 hours and can then be reused.
const KEY_RETENTION = '24 hours';
// A request still "in progress" after this long died mid-flight (crash, deploy);
// the key is handed to the next attempt. Money stays safe through the ledger's
// own (source, externalReference) idempotency.
const ABANDONED_AFTER = '5 minutes';

@Injectable()
export class IdempotencyStore {
  constructor(private readonly dataSource: DataSource) {}

  /** Reserves the key for this request, or reports what happened to it before. */
  async claim(scope: string, key: string, requestHash: string): Promise<Claim> {
    const inserted: unknown[] = await this.dataSource.query(
      `INSERT INTO idempotency_keys (scope, idempotency_key, request_hash, status)
       VALUES ($1, $2, $3, 'in_progress')
       ON CONFLICT (scope, idempotency_key) DO UPDATE
          SET request_hash    = EXCLUDED.request_hash,
              status          = 'in_progress',
              response_status = NULL,
              response_body   = NULL,
              created_at      = now()
        WHERE idempotency_keys.created_at < now() - interval '${KEY_RETENTION}'
           OR (idempotency_keys.status = 'in_progress'
               AND idempotency_keys.created_at < now() - interval '${ABANDONED_AFTER}')
       RETURNING idempotency_key`,
      [scope, key, requestHash],
    );
    if (inserted.length > 0) return { kind: 'claimed' };

    const [row]: {
      request_hash: string;
      status: string;
      response_status: number;
      response_body: unknown;
    }[] = await this.dataSource.query(
      `SELECT request_hash, status, response_status, response_body
         FROM idempotency_keys
        WHERE scope = $1 AND idempotency_key = $2`,
      [scope, key],
    );
    // released between our insert and select: the first request failed, ask to retry
    if (!row) return { kind: 'in_progress' };
    if (row.request_hash !== requestHash) return { kind: 'mismatch' };
    if (row.status !== 'completed') return { kind: 'in_progress' };
    return {
      kind: 'completed',
      status: row.response_status,
      body: row.response_body,
    };
  }

  async complete(
    scope: string,
    key: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE idempotency_keys
          SET status = 'completed', response_status = $3, response_body = $4
        WHERE scope = $1 AND idempotency_key = $2`,
      [scope, key, status, JSON.stringify(body ?? null)],
    );
  }

  /** Failed requests are not remembered, so the client can retry with the same key. */
  async release(scope: string, key: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM idempotency_keys
        WHERE scope = $1 AND idempotency_key = $2 AND status = 'in_progress'`,
      [scope, key],
    );
  }
}
