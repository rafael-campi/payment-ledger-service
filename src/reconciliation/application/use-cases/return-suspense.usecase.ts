import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { PIX_RAIL } from '../../../rails/pix-rail';
import type { PixRail, RailResult } from '../../../rails/pix-rail';
import { ListSuspenseUseCase, SuspenseItem } from './list-suspense.usecase';

const CURRENCY = 'BRL';

@Injectable()
export class ReturnSuspenseUseCase {
  private readonly logger = new Logger(ReturnSuspenseUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PIX_RAIL) private readonly pixRail: PixRail,
    private readonly listSuspense: ListSuspenseUseCase,
    private readonly postLedger: PostLedgerTransactionUseCase,
  ) {}

  /**
   * Sends an unmatched Pix back to its payer (devolução). Like every
   * outgoing money, the intent is recorded first (refund-in-transit), then
   * the rail is called, then the answer settles or compensates it.
   * Running it again for an item already on its way just resumes it.
   */
  async execute(endToEndId: string): Promise<SuspenseItem> {
    const [item] = await this.listSuspense.execute(endToEndId);
    if (!item) {
      throw new NotFoundError(
        'suspense.not_found',
        `No Pix ${endToEndId} in suspense.`,
      );
    }
    if (item.status === 'returned' || item.status === 'return_failed') {
      throw new DomainError(
        'suspense.already_handled',
        `Pix ${endToEndId} is ${item.status}.`,
      );
    }

    const post = (
      suffix: string,
      entries: [string, number][],
      description: string,
    ) =>
      this.postLedger.execute({
        description,
        source: 'suspense-return',
        externalReference: `${endToEndId}:${suffix}`,
        entries: entries.map(([accountId, amount]) => ({
          accountId,
          amount,
          currency: CURRENCY,
        })),
      });

    // idempotent: posting the same intent again returns the existing one
    await post(
      'intent',
      [
        [PlatformAccounts.SUSPENSE, item.amount],
        [PlatformAccounts.REFUND_IN_TRANSIT, -item.amount],
      ],
      `Return of unmatched Pix ${endToEndId}`,
    );

    let result: RailResult<{ returnId: string }>;
    try {
      result = await this.pixRail.refund({
        endToEndId,
        amount: item.amount,
        idempotencyKey: `suspense:${endToEndId}`,
      });
    } catch (error) {
      this.logger.error(`Pix rail did not answer for ${endToEndId}`, error);
      return { ...item, status: 'returning' };
    }

    await this.uow.run(() =>
      result.ok
        ? post(
            'sent',
            [
              [PlatformAccounts.REFUND_IN_TRANSIT, item.amount],
              [PlatformAccounts.PIX_SETTLEMENT, -item.amount],
            ],
            `Unmatched Pix ${endToEndId} returned (${result.returnId})`,
          )
        : post(
            'reversed',
            [
              [PlatformAccounts.REFUND_IN_TRANSIT, item.amount],
              [PlatformAccounts.SUSPENSE, -item.amount],
            ],
            `Return of ${endToEndId} refused (${result.reason})`,
          ),
    );
    return (await this.listSuspense.execute(endToEndId))[0];
  }
}
