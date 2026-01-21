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
  externalReference!: string | null;
  entries!: TransactionEntryDto[];
  createdAt!: Date;
}
