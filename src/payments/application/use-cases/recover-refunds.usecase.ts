import { Inject, Injectable } from '@nestjs/common';
import { REFUND_REPOSITORY } from '../../domain/ports/refund.repository';
import type { RefundRepository } from '../../domain/ports/refund.repository';
import { SendRefundUseCase } from './send-refund.usecase';

const STUCK_AFTER_MS = 60_000;

@Injectable()
export class RecoverRefundsUseCase {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
    private readonly sendRefund: SendRefundUseCase,
  ) {}

  /** Retries refunds left pending by a crash or a silent rail; returns how many. */
  async execute(now: Date = new Date()): Promise<number> {
    const stuck = await this.refunds.findStuckPending(
      new Date(now.getTime() - STUCK_AFTER_MS),
      20,
    );
    for (const refund of stuck) await this.sendRefund.execute(refund);
    return stuck.length;
  }
}
