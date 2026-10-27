import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/errors';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { prefixedId } from '../../../shared/utils/id';
import { GetAccountBalancesUseCase } from '../../../ledger/application/use-cases/get-account-balances.usecase';
import { PostLedgerTransactionUseCase } from '../../../ledger/application/use-cases/post-ledger-transaction.usecase';
import { PlatformAccounts } from '../../../ledger/domain/platform-accounts';
import { GetMerchantUseCase } from '../../../merchants/application/use-cases/get-merchant.usecase';
import {
  MERCHANT_CURRENCY,
  merchantAccounts,
} from '../../../merchants/domain/merchant-accounts';
import { Payout, PayoutStatus } from '../../domain/entities/payout.entity';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout.repository';
import type { PayoutRepository } from '../../domain/ports/payout.repository';
import { SendPayoutUseCase } from './send-payout.usecase';

// below this a Pix transfer is not worth making
const MIN_PAYOUT = 100;

@Injectable()
export class CreatePayoutUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: PayoutRepository,
    private readonly getMerchant: GetMerchantUseCase,
    private readonly balances: GetAccountBalancesUseCase,
    private readonly postLedger: PostLedgerTransactionUseCase,
    private readonly sendPayout: SendPayoutUseCase,
  ) {}

  /**
   * Pays out the available balance (or part of it) to the merchant's Pix
   * key. The money leaves the balance before the Pix is sent (intent first,
   * copilot_prompt.md) and comes back if the rail refuses it.
   */
  async execute(merchantId: string, amount?: number): Promise<Payout> {
    const merchant = await this.getMerchant.execute(merchantId);
    if (!merchant.payoutPixKey) {
      throw new DomainError(
        'settlement.no_payout_key',
        'Set the payout Pix key first (PATCH /v1/account).',
      );
    }

    const payout = await this.uow.run(async () => {
      // two payouts at once must not both see the same balance
      await this.payouts.lockMerchant(merchantId);
      const accounts = merchantAccounts(merchantId);
      const [row] = await this.balances.execute([accounts.available]);
      const available = -(row?.balance ?? 0);

      const value = amount ?? available;
      if (value < MIN_PAYOUT) {
        throw new DomainError(
          'settlement.amount_too_small',
          `Payouts start at ${MIN_PAYOUT} cents (available: ${available}).`,
        );
      }
      if (value > available) {
        throw new DomainError(
          'settlement.insufficient_balance',
          `The available balance is ${available} cents.`,
        );
      }

      const now = new Date();
      const created = new Payout(
        prefixedId('po'),
        merchantId,
        value,
        MERCHANT_CURRENCY,
        merchant.payoutPixKey!,
        PayoutStatus.PENDING,
        null,
        null,
        now,
        now,
      );
      await this.payouts.save(created);
      await this.postLedger.execute({
        description: `Payout ${created.id} to ${created.pixKey}`,
        source: 'payout',
        externalReference: `${created.id}:intent`,
        entries: [
          {
            accountId: accounts.available,
            amount: value,
            currency: MERCHANT_CURRENCY,
          },
          {
            accountId: PlatformAccounts.PAYOUT_IN_TRANSIT,
            amount: -value,
            currency: MERCHANT_CURRENCY,
          },
        ],
      });
      return created;
    });

    return this.sendPayout.execute(payout);
  }
}
