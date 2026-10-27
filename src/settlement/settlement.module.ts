import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { RailsModule } from '../rails/rails.module';
import { SettlementController } from './interfaces/http/settlement.controller';
import { ScheduleReceivablesUseCase } from './application/use-cases/schedule-receivables.usecase';
import { ReleaseReceivablesUseCase } from './application/use-cases/release-receivables.usecase';
import { ReverseReceivablesUseCase } from './application/use-cases/reverse-receivables.usecase';
import { RestoreReceivablesUseCase } from './application/use-cases/restore-receivables.usecase';
import { ListReceivablesUseCase } from './application/use-cases/list-receivables.usecase';
import { CreatePayoutUseCase } from './application/use-cases/create-payout.usecase';
import { SendPayoutUseCase } from './application/use-cases/send-payout.usecase';
import { RecoverPayoutsUseCase } from './application/use-cases/recover-payouts.usecase';
import { GetPayoutUseCase } from './application/use-cases/get-payout.usecase';
import { ListPayoutsUseCase } from './application/use-cases/list-payouts.usecase';
import { RECEIVABLE_REPOSITORY } from './domain/ports/receivable.repository';
import { PAYOUT_REPOSITORY } from './domain/ports/payout.repository';
import { TypeOrmReceivableRepository } from './infrastructure/persistence/typeorm/typeorm-receivable.repository';
import { TypeOrmPayoutRepository } from './infrastructure/persistence/typeorm/typeorm-payout.repository';
import { SettlementJob } from './infrastructure/jobs/settlement.job';

/**
 * Settlement (ADR 0002): when merchant money becomes available, and
 * payouts of it. Payments call in to schedule and reverse receivables.
 */
@Module({
  imports: [
    IdempotencyModule,
    LedgerModule,
    MerchantsModule,
    WebhooksModule,
    RailsModule,
  ],
  controllers: [SettlementController],
  providers: [
    ScheduleReceivablesUseCase,
    ReleaseReceivablesUseCase,
    ReverseReceivablesUseCase,
    RestoreReceivablesUseCase,
    ListReceivablesUseCase,
    CreatePayoutUseCase,
    SendPayoutUseCase,
    RecoverPayoutsUseCase,
    GetPayoutUseCase,
    ListPayoutsUseCase,
    SettlementJob,
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
    { provide: PAYOUT_REPOSITORY, useClass: TypeOrmPayoutRepository },
  ],
  exports: [
    ScheduleReceivablesUseCase,
    ReverseReceivablesUseCase,
    RestoreReceivablesUseCase,
    ReleaseReceivablesUseCase,
    RecoverPayoutsUseCase,
  ],
})
export class SettlementModule {}
