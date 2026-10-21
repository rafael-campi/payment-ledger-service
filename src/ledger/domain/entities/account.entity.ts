export type Currency = string; // ISO 4217, e.g. "BRL"

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export class Account {
  constructor(
    public readonly id: string,
    public readonly type: AccountType,
    public readonly currency: Currency,
  ) {}
}
