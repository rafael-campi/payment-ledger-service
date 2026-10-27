import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { merchantAccounts } from '../../../merchants/domain/merchant-accounts';
import { PublishEventUseCase } from '../../../webhooks/application/use-cases/publish-event.usecase';
import { EventTypes } from '../../../webhooks/domain/entities/event.entity';
import { PIX_RAIL } from '../../../rails/pix-rail';
import type { PixRail, RailResult } from '../../../rails/pix-rail';
import { Payout, PayoutStatus } from '../../domain/entities/payout.entity';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout.repository';
import type { PayoutRepository } from '../../domain/ports/payout.repository';
import { toPayoutResource } from '../resources';

@Injectable()
export class SendPayoutUseCase {
  private readonly logger = new Logger(SendPayoutUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: PayoutRepository,
    @Inject(PIX_RAIL) private readonly pixRail: PixRail,
    private readonly postLedger: PostLedgerTransactionUseCase,
    private readonly publishEvent: PublishEventUseCase,
  ) {}

  /**
   * Sends the Pix and settles the payout. Safe to run again: the rail is
   * idempotent on the payout id and only a pending payout moves.
   */
  async execute(payout: Payout): Promise<Payout> {
    if (payout.status !== PayoutStatus.PENDING) return payout;

    let result: RailResult<{ endToEndId: string }>;
    try {
      result = await this.pixRail.send({
        pixKey: payout.pixKey,
        amount: payout.amount,
        idempotencyKey: payout.id,
        description: `Repasse ${payout.id}`,
      });
    } catch (error) {
      // no answer: stays pending, RecoverPayoutsUseCase retries
      this.logger.error(`Pix rail did not answer for ${payout.id}`, error);
      return payout;
    }

    return this.uow.run(async () => {
      const locked = await this.payouts.lockById(payout.id);
      if (!locked || locked.status !== PayoutStatus.PENDING) {
        return locked ?? payout;
      }
      const now = new Date();
      const { currency, amount } = locked;
      const inTransit = PlatformAccounts.PAYOUT_IN_TRANSIT;

      const settled = result.ok
        ? locked.paid(result.endToEndId, now)
        : locked.fail(result.reason, now);
      await this.postLedger.execute(
        result.ok
          ? {
              description: `Payout ${locked.id} sent (${result.endToEndId})`,
              source: 'payout',
              externalReference: `${locked.id}:sent`,
              entries: [
                { accountId: inTransit, amount, currency },
                {
                  accountId: PlatformAccounts.PIX_SETTLEMENT,
                  amount: -amount,
                  currency,
                },
              ],
            }
          : {
              // compensation: the money goes back to the merchant
              description: `Payout ${locked.id} refused (${result.reason})`,
              source: 'payout',
              externalReference: `${locked.id}:reversed`,
              entries: [
                { accountId: inTransit, amount, currency },
                {
                  accountId: merchantAccounts(locked.merchantId).available,
                  amount: -amount,
                  currency,
                },
              ],
            },
      );
      await this.payouts.update(settled);
      await this.publishEvent.execute(
        settled.merchantId,
        result.ok ? EventTypes.PAYOUT_PAID : EventTypes.PAYOUT_FAILED,
        toPayoutResource(settled),
        now,
      );
      return settled;
    });
  }
}
