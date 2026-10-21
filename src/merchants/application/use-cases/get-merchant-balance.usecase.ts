import { Injectable } from '@nestjs/common';
import { GetAccountBalancesUseCase } from '../../../ledger/application/use-cases/get-account-balances.usecase';
import { merchantAccounts } from '../../domain/merchant-accounts';

export type Money = { amount: number; currency: string };

export type MerchantBalance = { available: Money[]; pending: Money[] };

@Injectable()
export class GetMerchantBalanceUseCase {
  constructor(private readonly balances: GetAccountBalancesUseCase) {}

  /** What the PSP owes the merchant, derived from the ledger. */
  async execute(merchantId: string): Promise<MerchantBalance> {
    const ids = merchantAccounts(merchantId);
    const rows = await this.balances.execute([ids.available, ids.pending]);

    // merchant accounts are liabilities: credits (negative) are money owed to them
    const owed = (accountId: string): Money[] =>
      rows
        .filter((row) => row.account.id === accountId)
        .map((row) => ({
          amount: -row.balance || 0, // a zero balance must not become -0
          currency: row.account.currency,
        }));

    return { available: owed(ids.available), pending: owed(ids.pending) };
  }
}
