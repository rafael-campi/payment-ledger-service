import { Transaction } from '../../../domain/entities/transaction.entity';

export class TransactionEntryDto {
  id!: string;
  transactionId!: string;
  accountId!: string;
  amount!: number;
  currency!: string;
  createdAt!: Date;
}

export class TransactionDto {
  id!: string;
  description!: string;
  source!: string;
  externalReference!: string;
  entries!: TransactionEntryDto[];
  createdAt!: Date;

  static from(tx: Transaction): TransactionDto {
    return {
      id: tx.id,
      description: tx.description,
      source: tx.source,
      externalReference: tx.externalReference,
      entries: tx.entries.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        accountId: e.accountId,
        amount: e.amount,
        currency: e.currency,
        createdAt: e.createdAt,
      })),
      createdAt: tx.createdAt,
    };
  }
}
