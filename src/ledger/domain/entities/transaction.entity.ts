import { LedgerEntry } from './ledger-entry.entity';

export class Transaction {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly externalReference: string | null,
    public readonly entries: LedgerEntry[],
    public readonly createdAt: Date = new Date(),
  ) {}
}
