export type Currency = string;

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  REVENUE = 'REVENUE',
}

export class Account {
  constructor(
    public readonly id: string,
    public readonly type: AccountType,
    public readonly currency: Currency,
  ) {}
}
