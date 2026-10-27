import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { RailsModule } from '../rails/rails.module';
import { ReconciliationController } from './interfaces/http/reconciliation.controller';
import { ReconcileUseCase } from './application/use-cases/reconcile.usecase';
import { ListSuspenseUseCase } from './application/use-cases/list-suspense.usecase';
import { ReturnSuspenseUseCase } from './application/use-cases/return-suspense.usecase';
import { ReconciliationJob } from './infrastructure/jobs/reconciliation.job';

/**
 * Reconciliation (operator only): reads across every module's tables on
 * purpose, to check that they agree. It changes money only to return
 * unmatched Pix, through the ledger like any other outgoing money.
 */
@Module({
  imports: [IdempotencyModule, LedgerModule, RailsModule],
  controllers: [ReconciliationController],
  providers: [
    ReconcileUseCase,
    ListSuspenseUseCase,
    ReturnSuspenseUseCase,
    ReconciliationJob,
  ],
  exports: [ReconcileUseCase],
})
export class ReconciliationModule {}
