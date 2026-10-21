import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const MAX_DETAILS = 50;

export type ReconciliationCheck = {
  name: string;
  description: string;
  ok: boolean;
  discrepancies: Record<string, unknown>[]; // up to MAX_DETAILS
};

export type ReconciliationReport = {
  ranAt: string;
  ok: boolean;
  checks: ReconciliationCheck[];
};

/**
 * Cross-checks every source of truth against the others, read-only. Each
 * check is a query that returns the rows that disagree: none means ok.
 * Comparing with an external bank statement is out of reach while the rails
 * are simulated (ADR 0001): there is no independent statement to compare to.
 */
@Injectable()
export class ReconcileUseCase {
  constructor(private readonly dataSource: DataSource) {}

  async execute(): Promise<ReconciliationReport> {
    const checks: ReconciliationCheck[] = [];
    for (const check of CHECKS) {
      const rows: Record<string, unknown>[] = await this.dataSource.query(
        `${check.sql} LIMIT ${MAX_DETAILS}`,
      );
      checks.push({
        name: check.name,
        description: check.description,
        ok: rows.length === 0,
        discrepancies: rows,
      });
    }
    return {
      ranAt: new Date().toISOString(),
      ok: checks.every((c) => c.ok),
      checks,
    };
  }
}

const CHECKS: { name: string; description: string; sql: string }[] = [
  {
    name: 'ledger_balanced',
    description: 'Every ledger transaction sums to zero.',
    sql: `SELECT transaction_id, SUM(amount)::text AS sum
            FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount) <> 0`,
  },
  {
    name: 'refunds_in_transit',
    description:
      'refund-in-transit holds exactly the refunds and suspense returns not settled yet.',
    sql: `WITH ledger AS (
            SELECT -COALESCE(SUM(amount), 0) AS held FROM ledger_entries
             WHERE account_id = 'refund-in-transit'),
          expected AS (
            SELECT (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE status = 'pending')
                 + (SELECT COALESCE(SUM(-e.amount), 0)
                      FROM ledger_transactions t
                      JOIN ledger_entries e ON e.transaction_id = t.id
                                           AND e.account_id = 'refund-in-transit'
                     WHERE t.source = 'suspense-return'
                       AND t.external_reference LIKE '%:intent'
                       AND NOT EXISTS (
                         SELECT 1 FROM ledger_transactions done
                          WHERE done.source = 'suspense-return'
                            AND done.external_reference IN (
                              replace(t.external_reference, ':intent', ':sent'),
                              replace(t.external_reference, ':intent', ':reversed')))
                   ) AS held)
          SELECT ledger.held::text AS ledger, expected.held::text AS expected
            FROM ledger, expected WHERE ledger.held <> expected.held`,
  },
  {
    name: 'payouts_in_transit',
    description: 'payout-in-transit holds exactly the payouts not settled yet.',
    sql: `SELECT ledger.held::text AS ledger, expected.held::text AS expected
            FROM (SELECT -COALESCE(SUM(amount), 0) AS held FROM ledger_entries
                   WHERE account_id = 'payout-in-transit') ledger,
                 (SELECT COALESCE(SUM(amount), 0) AS held FROM payouts
                   WHERE status = 'pending') expected
           WHERE ledger.held <> expected.held`,
  },
  {
    name: 'pending_matches_schedule',
    description:
      "Each merchant's pending balance equals what its receivables schedule has left to release.",
    sql: `WITH ledger AS (
            SELECT substring(account_id FROM '^merchant:(.*):pending$') AS merchant_id,
                   -SUM(amount) AS pending
              FROM ledger_entries WHERE account_id LIKE 'merchant:%:pending'
             GROUP BY account_id),
          schedule AS (
            SELECT merchant_id, SUM(amount - reversed_amount) AS scheduled
              FROM receivables WHERE released_at IS NULL GROUP BY merchant_id)
          SELECT merchant_id,
                 COALESCE(l.pending, 0)::text AS ledger,
                 COALESCE(s.scheduled, 0)::text AS schedule
            FROM ledger l FULL JOIN schedule s USING (merchant_id)
           WHERE COALESCE(l.pending, 0) <> COALESCE(s.scheduled, 0)`,
  },
  {
    name: 'paid_payments_in_ledger',
    description:
      'Every succeeded or refunded payment has its money in the ledger, for its full amount.',
    sql: `SELECT p.id AS payment_id, p.method, p.amount::text AS amount
            FROM payments p
            LEFT JOIN pix_charges pc ON pc.payment_id = p.id
            LEFT JOIN card_charges cc ON cc.payment_id = p.id
           WHERE p.status IN ('succeeded', 'refunded')
             AND NOT EXISTS (
               SELECT 1 FROM ledger_transactions t
                 JOIN ledger_entries e ON e.transaction_id = t.id
                WHERE ((t.source = 'pix' AND t.external_reference = pc.end_to_end_id
                        AND e.account_id = 'pix-settlement')
                    OR (t.source = 'card' AND t.external_reference = cc.authorization_id
                        AND e.account_id = 'acquirer-receivable'))
                  AND e.amount = p.amount)`,
  },
  {
    name: 'ledger_money_has_an_owner',
    description:
      'Every Pix or card credit in the ledger belongs to a paid payment, or sits in suspense.',
    sql: `SELECT t.id AS transaction_id, t.source, t.external_reference
            FROM ledger_transactions t
           WHERE t.source IN ('pix', 'card')
             AND NOT EXISTS (
               SELECT 1 FROM ledger_entries e
                WHERE e.transaction_id = t.id AND e.account_id = 'suspense')
             AND NOT EXISTS (
               SELECT 1 FROM payments p
                 LEFT JOIN pix_charges pc ON pc.payment_id = p.id
                 LEFT JOIN card_charges cc ON cc.payment_id = p.id
                WHERE p.status IN ('succeeded', 'refunded')
                  AND ((t.source = 'pix' AND pc.end_to_end_id = t.external_reference)
                    OR (t.source = 'card' AND cc.authorization_id = t.external_reference)))`,
  },
  {
    name: 'refunded_amounts',
    description:
      "Each payment's amountRefunded equals its pending and succeeded refunds.",
    sql: `SELECT p.id AS payment_id, p.amount_refunded::text AS payment,
                 COALESCE(r.total, 0)::text AS refunds
            FROM payments p
            LEFT JOIN (SELECT payment_id, SUM(amount) AS total FROM refunds
                        WHERE status IN ('pending', 'succeeded') GROUP BY payment_id) r
              ON r.payment_id = p.id
           WHERE p.amount_refunded <> COALESCE(r.total, 0)`,
  },
];
