import { Injectable } from '@nestjs/common';
import { IntervalJob } from '../../../shared/jobs/interval-job';
import { ExpirePaymentsUseCase } from '../../application/use-cases/expire-payments.usecase';
import { RecoverCardPaymentsUseCase } from '../../application/use-cases/recover-card-payments.usecase';
import { RecoverRefundsUseCase } from '../../application/use-cases/recover-refunds.usecase';

/**
 * Expires overdue payments and finishes card payments and refunds a crash
 * (or a silent rail) left pending.
 */
@Injectable()
export class PaymentsMaintenanceJob extends IntervalJob {
  protected readonly intervalEnvVar = 'PAYMENTS_EXPIRY_INTERVAL_MS';
  protected readonly defaultIntervalMs = 10_000;

  constructor(
    private readonly expirePayments: ExpirePaymentsUseCase,
    private readonly recoverCardPayments: RecoverCardPaymentsUseCase,
    private readonly recoverRefunds: RecoverRefundsUseCase,
  ) {
    super();
  }

  protected async tick() {
    await this.expirePayments.execute();
    await this.recoverCardPayments.execute();
    await this.recoverRefunds.execute();
  }
}
