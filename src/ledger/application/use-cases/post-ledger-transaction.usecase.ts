import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConflictError, DomainError } from '../../../shared/errors';
import { LedgerEntry } from '../../domain/entities/ledger-entry.entity';
import { Transaction } from '../../domain/entities/transaction.entity';
import { validateDoubleEntry } from '../../domain/rules/validate-double-entry.rule';
import {
  DuplicateTransactionReferenceError,
  LEDGER_REPOSITORY,
} from '../../domain/ports/ledger.repository';
import type { LedgerRepository } from '../../domain/ports/ledger.repository';

export type PostLedgerEntryInput = {
  accountId: string;
  amount: number;
  currency: string;
};

export type PostLedgerTransactionInput = {
  description: string;
  source: string;
  externalReference: string;
  entries: PostLedgerEntryInput[];
};

@Injectable()
export class PostLedgerTransactionUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY) private readonly repository: LedgerRepository,
  ) {}

  /**
   * Idempotent on (source, externalReference): posting the same transaction
   * again returns the one already in the ledger instead of moving money twice.
   */
  async execute(input: PostLedgerTransactionInput): Promise<Transaction> {
    const existing = await this.repository.findByReference(
      input.source,
      input.externalReference,
    );
    if (existing) {
      return this.sameOrConflict(existing, input);
    }

    const txId = randomUUID();
    const createdAt = new Date();
    const entries = input.entries.map(
      (e) =>
        new LedgerEntry(
          randomUUID(),
          txId,
          e.accountId,
          e.amount,
          e.currency,
          createdAt,
        ),
    );

    validateDoubleEntry(entries);
    await this.ensureAccountsAccept(entries);

    const tx = new Transaction(
      txId,
      input.description,
      input.source,
      input.externalReference,
      entries,
      createdAt,
    );

    try {
      await this.repository.saveTransaction(tx);
      return tx;
    } catch (error) {
      // a concurrent request posted the same reference between our read and write
      if (error instanceof DuplicateTransactionReferenceError) {
        const winner = await this.repository.findByReference(
          input.source,
          input.externalReference,
        );
        if (winner) return this.sameOrConflict(winner, input);
      }
      throw error;
    }
  }

  private async ensureAccountsAccept(entries: LedgerEntry[]): Promise<void> {
    const ids = [...new Set(entries.map((e) => e.accountId))];
    const accounts = new Map(
      (await this.repository.findAccounts(ids)).map((a) => [a.id, a]),
    );
    for (const e of entries) {
      const account = accounts.get(e.accountId);
      if (!account) {
        throw new DomainError(
          'ledger.unknown_account',
          `Account ${e.accountId} does not exist.`,
        );
      }
      if (account.currency !== e.currency) {
        throw new DomainError(
          'ledger.account_currency_mismatch',
          `Account ${e.accountId} holds ${account.currency}, not ${e.currency}.`,
        );
      }
    }
  }

  private sameOrConflict(
    existing: Transaction,
    input: PostLedgerTransactionInput,
  ): Transaction {
    const key = (e: PostLedgerEntryInput) =>
      `${e.accountId}|${e.amount}|${e.currency}`;
    const existingEntries = existing.entries.map(key).sort().join(',');
    const inputEntries = input.entries.map(key).sort().join(',');

    if (
      existing.description !== input.description ||
      existingEntries !== inputEntries
    ) {
      throw new ConflictError(
        'ledger.reference_conflict',
        `Transaction ${input.source}/${input.externalReference} was already posted with different content.`,
      );
    }
    return existing;
  }
}
