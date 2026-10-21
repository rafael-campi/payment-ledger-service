import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { LedgerController } from './interfaces/http/controllers/ledger.controller';
import { PostLedgerTransactionUseCase } from './application/use-cases/post-ledger-transaction.usecase';
import { PostManualTransactionUseCase } from './application/use-cases/post-manual-transaction.usecase';
import { ListTransactionsUseCase } from './application/use-cases/list-transactions.usecase';
import { OpenAccountsUseCase } from './application/use-cases/open-accounts.usecase';
import { GetAccountBalancesUseCase } from './application/use-cases/get-account-balances.usecase';
import { LEDGER_REPOSITORY } from './domain/ports/ledger.repository';
import { TypeOrmLedgerRepository } from './infrastructure/persistence/typeorm/typeorm-ledger.repository';

@Module({
  imports: [IdempotencyModule],
  controllers: [LedgerController],
  providers: [
    PostLedgerTransactionUseCase,
    PostManualTransactionUseCase,
    ListTransactionsUseCase,
    OpenAccountsUseCase,
    GetAccountBalancesUseCase,
    { provide: LEDGER_REPOSITORY, useClass: TypeOrmLedgerRepository },
  ],
  exports: [
    PostLedgerTransactionUseCase,
    ListTransactionsUseCase,
    OpenAccountsUseCase,
    GetAccountBalancesUseCase,
  ],
})
export class LedgerModule {}
