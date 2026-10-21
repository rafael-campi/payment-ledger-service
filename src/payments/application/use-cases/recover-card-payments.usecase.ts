import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { AuthorizeCardPaymentUseCase } from './authorize-card-payment.usecase';

// a card payment normally leaves "pending" within the request that created it
const STUCK_AFTER_MS = 60_000;
const BATCH_SIZE = 20;

@Injectable()
export class RecoverCardPaymentsUseCase {
  private readonly logger = new Logger(RecoverCardPaymentsUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    private readonly authorizeCard: AuthorizeCardPaymentUseCase,
  ) {}

  /**
   * Finishes card payments whose process died while the acquirer answered.
   * The authorization is retried with the same idempotency key, so a card
   * is never charged twice. Returns how many were retried.
   */
  async execute(now: Date = new Date()): Promise<number> {
    const stuck = await this.payments.findStuckCardPayments(
      new Date(now.getTime() - STUCK_AFTER_MS),
      BATCH_SIZE,
    );
    for (const payment of stuck) {
      try {
        await this.authorizeCard.execute(payment);
      } catch (error) {
        this.logger.error(`Could not recover payment ${payment.id}`, error);
      }
    }
    return stuck.length;
  }
}
