import { Inject, Injectable } from '@nestjs/common';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { ACQUIRER_RAIL } from '../../../rails/acquirer-rail';
import type { AcquirerRail } from '../../../rails/acquirer-rail';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { toPaymentResource } from '../payment-resource';

@Injectable()
export class CancelPaymentUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(ACQUIRER_RAIL) private readonly acquirer: AcquirerRail,
    private readonly publishEvent: PublishEventUseCase,
  ) {}

  /**
   * Idempotent. A pending payment or an uncaptured card authorization can
   * be canceled; the authorization is voided so the card's hold is released.
   */
  async execute(merchantId: string, id: string): Promise<Payment> {
    return this.uow.run(async () => {
      const payment = await this.payments.lockById(merchantId, id);
      if (!payment) {
        throw new NotFoundError(
          'payments.not_found',
          `Payment ${id} does not exist.`,
        );
      }
      if (payment.status === PaymentStatus.CANCELED) return payment;
      if (!payment.isOpen) {
        throw new DomainError(
          'payments.not_cancelable',
          `Payment ${id} is ${payment.status} and can no longer be canceled.`,
        );
      }

      if (payment.card?.authorizationId) {
        await this.acquirer.void(payment.card.authorizationId);
      }
      const now = new Date();
      const canceled = payment.cancel(now);
      await this.payments.update(canceled);
      await this.publishEvent.execute(
        merchantId,
        EventTypes.PAYMENT_CANCELED,
        toPaymentResource(canceled),
        now,
      );
      return canceled;
    });
  }
}
