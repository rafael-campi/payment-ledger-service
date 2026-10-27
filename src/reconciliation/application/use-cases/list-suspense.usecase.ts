import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type SuspenseItem = {
  endToEndId: string;
  amount: number;
  receivedAt: string;
  description: string;
  // open: waiting for an operator; returning: Pix devolução on its way;
  // returned: back with the payer; return_failed: the rail refused it
  status: 'open' | 'returning' | 'returned' | 'return_failed';
};

/** Pix the PSP received but could not match to a payable charge (stage 2). */
@Injectable()
export class ListSuspenseUseCase {
  constructor(private readonly dataSource: DataSource) {}

  async execute(endToEndId?: string): Promise<SuspenseItem[]> {
    const rows: {
      end_to_end_id: string;
      amount: string;
      received_at: Date;
      description: string;
      intent: boolean;
      sent: boolean;
      reversed: boolean;
    }[] = await this.dataSource.query(
      `SELECT t.external_reference AS end_to_end_id,
              (-e.amount)::text AS amount,
              t.created_at AS received_at,
              t.description,
              EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.source = 'suspense-return'
                       AND r.external_reference = t.external_reference || ':intent') AS intent,
              EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.source = 'suspense-return'
                       AND r.external_reference = t.external_reference || ':sent') AS sent,
              EXISTS (SELECT 1 FROM ledger_transactions r WHERE r.source = 'suspense-return'
                       AND r.external_reference = t.external_reference || ':reversed') AS reversed
         FROM ledger_transactions t
         JOIN ledger_entries e ON e.transaction_id = t.id AND e.account_id = 'suspense'
        WHERE t.source = 'pix' AND e.amount < 0
          AND ($1::text IS NULL OR t.external_reference = $1)
        ORDER BY t.created_at DESC`,
      [endToEndId ?? null],
    );
    return rows.map((r) => ({
      endToEndId: r.end_to_end_id,
      amount: Number(r.amount),
      receivedAt: r.received_at.toISOString(),
      description: r.description,
      status: r.sent
        ? 'returned'
        : r.reversed
          ? 'return_failed'
          : r.intent
            ? 'returning'
            : 'open',
    }));
  }
}
