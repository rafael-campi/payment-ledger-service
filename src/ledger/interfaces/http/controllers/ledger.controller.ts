import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PlatformGuard } from '../../../../shared/auth/platform.guard';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { PostLedgerTransactionDto } from '../dto/post-ledger-transaction.dto';
import { TransactionDto } from '../dto/transaction.dto';
import { AccountBalanceDto } from '../dto/account-balance.dto';
import { PostManualTransactionUseCase } from '../../../application/use-cases/post-manual-transaction.usecase';
import { ListTransactionsUseCase } from '../../../application/use-cases/list-transactions.usecase';
import { GetAccountBalancesUseCase } from '../../../application/use-cases/get-account-balances.usecase';

/** Operator view of the raw ledger. Merchants see their money via /v1/balance. */
@Controller('ledger')
@UseGuards(PlatformGuard)
export class LedgerController {
  constructor(
    private readonly postUseCase: PostManualTransactionUseCase,
    private readonly listUseCase: ListTransactionsUseCase,
    private readonly balancesUseCase: GetAccountBalancesUseCase,
  ) {}

  @Post('transactions')
  @Idempotent()
  async postTransaction(
    @Body() dto: PostLedgerTransactionDto,
  ): Promise<TransactionDto> {
    const tx = await this.postUseCase.execute({
      description: dto.description,
      source: dto.source,
      externalReference: dto.externalReference,
      entries: dto.entries.map((e) => ({
        accountId: e.accountId,
        amount: e.amount,
        currency: e.currency,
      })),
    });
    return TransactionDto.from(tx);
  }

  @Get('transactions')
  async listTransactions(): Promise<TransactionDto[]> {
    const transactions = await this.listUseCase.execute();
    return transactions.map((tx) => TransactionDto.from(tx));
  }

  @Get('accounts')
  async listAccounts(): Promise<AccountBalanceDto[]> {
    const balances = await this.balancesUseCase.execute();
    return balances.map(({ account, balance }) => ({
      id: account.id,
      type: account.type,
      currency: account.currency,
      balance,
    }));
  }
}
