import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PostLedgerTransactionDto } from '../dto/post-ledger-transaction.dto';
import { TransactionDto } from '../dto/transaction.dto';
import { PostLedgerTransactionUseCase } from '../../../application/use-cases/post-ledger-transaction.usecase';
import { ListTransactionsUseCase } from '../../../application/use-cases/list-transactions.usecase';

@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly postUseCase: PostLedgerTransactionUseCase,
    private readonly listUseCase: ListTransactionsUseCase,
  ) {}

  @Post('transactions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async postTransaction(@Body() dto: PostLedgerTransactionDto): Promise<void> {
    await this.postUseCase.execute({
      description: dto.description,
      externalReference: dto.externalReference ?? null,
      entries: dto.entries.map((e) => ({
        accountId: e.accountId,
        amount: e.amount,
        currency: e.currency,
      })),
    });
  }

  @Get('transactions')
  async listTransactions(): Promise<TransactionDto[]> {
    const transactions = await this.listUseCase.execute();
    return transactions.map((tx) => ({
      id: tx.id,
      description: tx.description,
      externalReference: tx.externalReference,
      entries: tx.entries.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        accountId: e.accountId,
        amount: e.amount,
        currency: e.currency,
        createdAt: e.createdAt,
      })),
      createdAt: tx.createdAt,
    }));
  }
}
