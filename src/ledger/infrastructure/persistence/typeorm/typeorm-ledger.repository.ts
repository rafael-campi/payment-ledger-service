import { Injectable } from '@nestjs/common';
import { In, QueryFailedError } from 'typeorm';
import { TypeOrmUnitOfWork } from '../../../../shared/database/unit-of-work';
import { Account, AccountType } from '../../../domain/entities/account.entity';
import { LedgerEntry } from '../../../domain/entities/ledger-entry.entity';
import { Transaction } from '../../../domain/entities/transaction.entity';
import {
  AccountBalance,
  DuplicateTransactionReferenceError,
  LedgerRepository,
} from '../../../domain/ports/ledger.repository';
import {
  LedgerAccountRecord,
  LedgerEntryRecord,
  LedgerTransactionRecord,
} from './ledger.records';

const UNIQUE_SOURCE_REFERENCE = 'uq_ledger_transactions_source_reference';

@Injectable()
export class TypeOrmLedgerRepository implements LedgerRepository {
  // every query goes through the unit of work, so it joins the caller's transaction
  constructor(private readonly uow: TypeOrmUnitOfWork) {}

  async saveTransaction(transaction: Transaction): Promise<void> {
    try {
      await this.uow.run(async () => {
        const manager = this.uow.manager();
        await manager.insert(LedgerTransactionRecord, {
          id: transaction.id,
          description: transaction.description,
          source: transaction.source,
          externalReference: transaction.externalReference,
          createdAt: transaction.createdAt,
        });
        await manager.insert(
          LedgerEntryRecord,
          transaction.entries.map((e) => ({
            id: e.id,
            transactionId: e.transactionId,
            accountId: e.accountId,
            amount: e.amount,
            currency: e.currency,
            createdAt: e.createdAt,
          })),
        );
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { constraint?: string })?.constraint ===
          UNIQUE_SOURCE_REFERENCE
      ) {
        throw new DuplicateTransactionReferenceError(
          transaction.source,
          transaction.externalReference,
        );
      }
      throw error;
    }
  }

  async findByReference(
    source: string,
    externalReference: string,
  ): Promise<Transaction | null> {
    const record = await this.uow
      .manager()
      .getRepository(LedgerTransactionRecord)
      .findOne({
        where: { source, externalReference },
        relations: { entries: true },
      });
    return record ? toDomain(record) : null;
  }

  async listTransactions(): Promise<Transaction[]> {
    const records = await this.uow
      .manager()
      .getRepository(LedgerTransactionRecord)
      .find({
        relations: { entries: true },
        order: { createdAt: 'ASC', id: 'ASC', entries: { id: 'ASC' } },
      });
    return records.map(toDomain);
  }

  async findAccounts(ids: string[]): Promise<Account[]> {
    if (ids.length === 0) return [];
    const records = await this.uow
      .manager()
      .getRepository(LedgerAccountRecord)
      .findBy({ id: In(ids) });
    return records.map(toAccount);
  }

  async insertAccounts(accounts: Account[]): Promise<void> {
    if (accounts.length === 0) return;
    await this.uow
      .manager()
      .createQueryBuilder()
      .insert()
      .into(LedgerAccountRecord)
      .values(
        accounts.map((a) => ({ id: a.id, type: a.type, currency: a.currency })),
      )
      .orIgnore()
      .execute();
  }

  async accountBalances(ids?: string[]): Promise<AccountBalance[]> {
    const rows: {
      id: string;
      type: string;
      currency: string;
      balance: string;
    }[] = await this.uow.manager().query(
      `SELECT a.id, a.type, a.currency, COALESCE(SUM(e.amount), 0)::text AS balance
         FROM ledger_accounts a
         LEFT JOIN ledger_entries e ON e.account_id = a.id
        WHERE $1::varchar[] IS NULL OR a.id = ANY($1)
        GROUP BY a.id
        ORDER BY a.id`,
      [ids ?? null],
    );
    return rows.map((row) => {
      const balance = Number(row.balance);
      if (!Number.isSafeInteger(balance)) {
        throw new Error(`Balance of ${row.id} exceeds the safe integer range`);
      }
      return { account: toAccount(row), balance };
    });
  }
}

function toAccount(record: {
  id: string;
  type: string;
  currency: string;
}): Account {
  return new Account(record.id, record.type as AccountType, record.currency);
}

function toDomain(record: LedgerTransactionRecord): Transaction {
  return new Transaction(
    record.id,
    record.description,
    record.source,
    record.externalReference,
    record.entries.map(
      (e) =>
        new LedgerEntry(
          e.id,
          e.transactionId,
          e.accountId,
          e.amount,
          e.currency,
          e.createdAt,
        ),
    ),
    record.createdAt,
  );
}
