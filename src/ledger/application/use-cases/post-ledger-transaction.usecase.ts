import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LedgerEntry } from '../../domain/entities/ledger-entry.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { validateDoubleEntry } from '../../domain/rules/validate-double-entry.rule';
import type { LedgerRepository } from '../../domain/ports/ledger.repository';

export type PostLedgerEntryInput = {
  accountId: string;
  amount: number;
  currency: string;
};

export type PostLedgerTransactionInput = {
  description: string;
  externalReference?: string | null;
  entries: PostLedgerEntryInput[];
};

@Injectable()
export class PostLedgerTransactionUseCase {
  constructor(private readonly repository: LedgerRepository) {}

  async execute(input: PostLedgerTransactionInput): Promise<void> {
    const txId = randomUUID();

    const entries = input.entries.map(
      (e) =>
        new LedgerEntry(
          randomUUID(),
          txId,
          e.accountId,
          e.amount,
          e.currency,
        ),
    );

    validateDoubleEntry(entries);

    const tx = new Transaction(
      txId,
      input.description,
      input.externalReference ?? null,
      entries,
    );

    await this.repository.saveTransaction(tx);
  }
}
