import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { AuthorizeWithCardUseCase } from '../../../vault/application/use-cases/authorize-with-card.usecase';
import { PurgeCardUseCase } from '../../../vault/application/use-cases/purge-card.usecase';
import { ACQUIRER_RAIL } from '../../../rails/acquirer-rail';
import type {
  AcquirerRail,
  AuthorizationResult,
} from '../../../rails/acquirer-rail';
import { Payment, PaymentStatus } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';
import { toPaymentResource } from '../payment-resource';
import { CapturePaymentUseCase } from './capture-payment.usecase';

@Injectable()
export class AuthorizeCardPaymentUseCase {
  private readonly logger = new Logger(AuthorizeCardPaymentUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(ACQUIRER_RAIL) private readonly acquirer: AcquirerRail,
    private readonly authorizeWithCard: AuthorizeWithCardUseCase,
    private readonly purgeCard: PurgeCardUseCase,
    private readonly capture: CapturePaymentUseCase,
    private readonly publishEvent: PublishEventUseCase,
  ) {}

  /**
   * Asks the acquirer (through the vault, which holds the number) and
   * applies the answer. Safe to run again for the same payment: the
   * acquirer is idempotent on the payment id, and only a pending payment moves.
   */
  async execute(payment: Payment): Promise<Payment> {
    if (payment.status !== PaymentStatus.PENDING || !payment.card) {
      return payment;
    }

    // outside any transaction: no row lock is held while the acquirer answers
    let result: AuthorizationResult;
    try {
      result = await this.authorizeWithCard.execute({
        merchantId: payment.merchantId,
        tokenId: payment.card.tokenId,
        paymentId: payment.id,
        amount: payment.amount,
        installments: payment.card.installments,
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      // No answer is not a decline: the card may have been authorized. The
      // payment stays pending, recovery retries with the same key and the
      // merchant learns the outcome by webhook, as with Pix.
      this.logger.error(`Acquirer did not answer for ${payment.id}`, error);
      return payment;
    }

    return this.uow.run(async () => {
      const locked = await this.payments.lockById(
        payment.merchantId,
        payment.id,
      );
      if (!locked || locked.status !== PaymentStatus.PENDING) {
        // canceled while the acquirer answered: release the hold on the card
        if (locked?.status === PaymentStatus.CANCELED && result.approved) {
          await this.acquirer.void(result.authorizationId);
        }
        return locked ?? payment; // otherwise another worker already applied it
      }
      const now = new Date();
      // the acquirer has answered: the card number is not needed anymore
      await this.purgeCard.execute(payment.card!.tokenId);

      if (!result.approved) {
        const failed = locked.fail(result.declineCode, now);
        await this.payments.update(failed);
        await this.publishEvent.execute(
          failed.merchantId,
          EventTypes.PAYMENT_FAILED,
          toPaymentResource(failed),
          now,
        );
        return failed;
      }

      const authorized = locked.authorize(result.authorizationId, now);
      if (authorized.card!.capture) {
        return this.capture.captureLocked(authorized);
      }
      await this.payments.update(authorized);
      await this.publishEvent.execute(
        authorized.merchantId,
        EventTypes.PAYMENT_AUTHORIZED,
        toPaymentResource(authorized),
        now,
      );
      return authorized;
    });
  }
}
