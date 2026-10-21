import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { VaultModule } from '../vault/vault.module';
import { RailsModule } from '../rails/rails.module';
import { SettlementModule } from '../settlement/settlement.module';
import { PaymentsController } from './interfaces/http/controllers/payments.controller';
import { RefundsController } from './interfaces/http/controllers/refunds.controller';
import { CreateRefundUseCase } from './application/use-cases/create-refund.usecase';
import { SendRefundUseCase } from './application/use-cases/send-refund.usecase';
import { RecoverRefundsUseCase } from './application/use-cases/recover-refunds.usecase';
import { GetRefundUseCase } from './application/use-cases/get-refund.usecase';
import { ListRefundsUseCase } from './application/use-cases/list-refunds.usecase';
import { REFUND_REPOSITORY } from './domain/ports/refund.repository';
import { TypeOrmRefundRepository } from './infrastructure/persistence/typeorm/typeorm-refund.repository';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.usecase';
import { GetPaymentUseCase } from './application/use-cases/get-payment.usecase';
import { ListPaymentsUseCase } from './application/use-cases/list-payments.usecase';
import { CancelPaymentUseCase } from './application/use-cases/cancel-payment.usecase';
import { CapturePaymentUseCase } from './application/use-cases/capture-payment.usecase';
import { AuthorizeCardPaymentUseCase } from './application/use-cases/authorize-card-payment.usecase';
import { RecoverCardPaymentsUseCase } from './application/use-cases/recover-card-payments.usecase';
import { ReceivePixUseCase } from './application/use-cases/receive-pix.usecase';
import { ExpirePaymentsUseCase } from './application/use-cases/expire-payments.usecase';
import { FindPaymentByTxidUseCase } from './application/use-cases/find-payment-by-txid.usecase';
import { PAYMENT_REPOSITORY } from './domain/ports/payment.repository';
import { TypeOrmPaymentRepository } from './infrastructure/persistence/typeorm/typeorm-payment.repository';
import { PaymentsMaintenanceJob } from './infrastructure/jobs/payments-maintenance.job';

@Module({
  imports: [
    IdempotencyModule,
    LedgerModule,
    MerchantsModule,
    WebhooksModule,
    VaultModule,
    RailsModule,
    SettlementModule,
  ],
  controllers: [PaymentsController, RefundsController],
  providers: [
    CreatePaymentUseCase,
    GetPaymentUseCase,
    ListPaymentsUseCase,
    CancelPaymentUseCase,
    CapturePaymentUseCase,
    AuthorizeCardPaymentUseCase,
    RecoverCardPaymentsUseCase,
    ReceivePixUseCase,
    ExpirePaymentsUseCase,
    FindPaymentByTxidUseCase,
    PaymentsMaintenanceJob,
    CreateRefundUseCase,
    SendRefundUseCase,
    RecoverRefundsUseCase,
    GetRefundUseCase,
    ListRefundsUseCase,
    { provide: REFUND_REPOSITORY, useClass: TypeOrmRefundRepository },
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
  ],
  // the rail side (simulator now, a bank webhook later) reports money arriving
  exports: [
    ReceivePixUseCase,
    FindPaymentByTxidUseCase,
    ExpirePaymentsUseCase,
    RecoverCardPaymentsUseCase,
    RecoverRefundsUseCase,
  ],
})
export class PaymentsModule {}
