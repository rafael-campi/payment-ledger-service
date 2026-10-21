import { Injectable } from '@nestjs/common';
import { IntervalJob } from '../../../shared/jobs/interval-job';
import { DispatchWebhooksUseCase } from '../../application/use-cases/dispatch-webhooks.usecase';

@Injectable()
export class DispatchWebhooksJob extends IntervalJob {
  protected readonly intervalEnvVar = 'WEBHOOK_DISPATCH_INTERVAL_MS';
  protected readonly defaultIntervalMs = 2_000;

  constructor(private readonly dispatch: DispatchWebhooksUseCase) {
    super();
  }

  protected tick() {
    return this.dispatch.execute();
  }
}
