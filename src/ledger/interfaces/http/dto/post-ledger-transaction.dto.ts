export class PostLedgerEntryDto {
  accountId!: string;
  amount!: number; // smallest unit (cents)
  currency!: string;
}

export class PostLedgerTransactionDto {
  description!: string;
  externalReference?: string | null;
  entries!: PostLedgerEntryDto[];
}
