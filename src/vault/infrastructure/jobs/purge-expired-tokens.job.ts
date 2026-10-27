import { Injectable } from '@nestjs/common';
import { IntervalJob } from '../../../shared/jobs/interval-job';
import { PurgeExpiredTokensUseCase } from '../../application/use-cases/purge-expired-tokens.usecase';

@Injectable()
export class PurgeExpiredTokensJob extends IntervalJob {
  protected readonly intervalEnvVar = 'VAULT_PURGE_INTERVAL_MS';
  protected readonly defaultIntervalMs = 60_000;

  constructor(private readonly purge: PurgeExpiredTokensUseCase) {
    super();
  }

  protected tick() {
    return this.purge.execute();
  }
}
