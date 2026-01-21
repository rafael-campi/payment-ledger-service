import { Module } from '@nestjs/common';
import { LedgerController } from './interfaces/http/controllers/ledger.controller';
import { PostLedgerTransactionUseCase } from './application/use-cases/post-ledger-transaction.usecase';
import { ListTransactionsUseCase } from './application/use-cases/list-transactions.usecase';
import { InMemoryLedgerRepository } from './infrastructure/persistence/in-memory-ledger.repository';

@Module({
  controllers: [LedgerController],
  providers: [
    PostLedgerTransactionUseCase,
    ListTransactionsUseCase,
    { provide: 'LedgerRepository', useClass: InMemoryLedgerRepository },
    InMemoryLedgerRepository,
  ],
  exports: [PostLedgerTransactionUseCase, ListTransactionsUseCase],
})
export class LedgerModule {}
