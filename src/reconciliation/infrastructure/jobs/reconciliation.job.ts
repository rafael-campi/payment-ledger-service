import { Injectable, Logger } from '@nestjs/common';
import { IntervalJob } from '../../../shared/jobs/interval-job';
import { ReconcileUseCase } from '../../application/use-cases/reconcile.usecase';

/** Runs the reconciliation and logs every check that fails, for alerting. */
@Injectable()
export class ReconciliationJob extends IntervalJob {
  protected readonly intervalEnvVar = 'RECONCILIATION_INTERVAL_MS';
  protected readonly defaultIntervalMs = 60 * 60_000;
  private readonly log = new Logger(ReconciliationJob.name);

  constructor(private readonly reconcile: ReconcileUseCase) {
    super();
  }

  protected async tick() {
    const report = await this.reconcile.execute();
    for (const check of report.checks.filter((c) => !c.ok)) {
      this.log.error(
        `Reconciliation check ${check.name} failed: ${JSON.stringify(check.discrepancies)}`,
      );
    }
  }
}
