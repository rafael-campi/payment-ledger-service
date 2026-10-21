import { Currency } from './account.entity';

export class LedgerEntry {
  constructor(
    public readonly id: string,
    public readonly transactionId: string,
    public readonly accountId: string,
    public readonly amount: number, // smallest unit (cents); positive = debit, negative = credit
    public readonly currency: Currency,
    public readonly createdAt: Date = new Date(),
  ) {}
}
