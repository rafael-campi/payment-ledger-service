import { Injectable } from '@nestjs/common';
import { IntervalJob } from '../../../shared/jobs/interval-job';
import { ReleaseReceivablesUseCase } from '../../application/use-cases/release-receivables.usecase';
import { RecoverPayoutsUseCase } from '../../application/use-cases/recover-payouts.usecase';

/** Releases due receivables and retries payouts a crash left pending. */
@Injectable()
export class SettlementJob extends IntervalJob {
  protected readonly intervalEnvVar = 'SETTLEMENT_INTERVAL_MS';
  protected readonly defaultIntervalMs = 60_000;

  constructor(
    private readonly release: ReleaseReceivablesUseCase,
    private readonly recoverPayouts: RecoverPayoutsUseCase,
  ) {
    super();
  }

  protected async tick() {
    await this.release.execute();
    await this.recoverPayouts.execute();
  }
}
