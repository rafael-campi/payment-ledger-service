export class AccountBalanceDto {
  id!: string;
  type!: string;
  currency!: string;
  balance!: number; // debit-positive sum of all entries, in cents
}
