import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { ACQUIRER_RAIL } from '../../../rails/acquirer-rail';
import type { AcquirerRail } from '../../../rails/acquirer-rail';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { toPaymentResource } from '../payment-resource';

const BATCH_SIZE = 100;

@Injectable()
export class ExpirePaymentsUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(ACQUIRER_RAIL) private readonly acquirer: AcquirerRail,
    private readonly publishEvent: PublishEventUseCase,
  ) {}

  /**
   * Expires one batch of overdue payments: unpaid Pix charges and card
   * authorizations never captured (voided, so the hold is released).
   * Returns how many.
   */
  async execute(now: Date = new Date()): Promise<number> {
    return this.uow.run(async () => {
      const overdue = await this.payments.lockExpiredOpen(now, BATCH_SIZE);
      for (const payment of overdue) {
        if (payment.card?.authorizationId) {
          await this.acquirer.void(payment.card.authorizationId);
        }
        const expired = payment.expire(now);
        await this.payments.update(expired);
        await this.publishEvent.execute(
          expired.merchantId,
          EventTypes.PAYMENT_EXPIRED,
          toPaymentResource(expired),
          now,
        );
      }
      return overdue.length;
    });
  }
}
