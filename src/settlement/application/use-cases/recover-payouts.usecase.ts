import { Inject, Injectable } from '@nestjs/common';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout.repository';
import type { PayoutRepository } from '../../domain/ports/payout.repository';
import { SendPayoutUseCase } from './send-payout.usecase';

const STUCK_AFTER_MS = 60_000;

@Injectable()
export class RecoverPayoutsUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: PayoutRepository,
    private readonly sendPayout: SendPayoutUseCase,
  ) {}

  /** Retries payouts left pending by a crash or a silent rail; returns how many. */
  async execute(now: Date = new Date()): Promise<number> {
    const stuck = await this.payouts.findStuckPending(
      new Date(now.getTime() - STUCK_AFTER_MS),
      20,
    );
    for (const payout of stuck) await this.sendPayout.execute(payout);
    return stuck.length;
  }
}
