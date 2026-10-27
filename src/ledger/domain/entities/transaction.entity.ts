import { LedgerEntry } from './ledger-entry.entity';

export class Transaction {
  constructor(
    public readonly id: string,
    public readonly description: string,
    // who posted it (e.g. "pix", "manual"); unique together with externalReference
    public readonly source: string,
    public readonly externalReference: string,
    public readonly entries: LedgerEntry[],
    public readonly createdAt: Date = new Date(),
  ) {}
}
