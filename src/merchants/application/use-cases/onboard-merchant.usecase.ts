import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../shared/database/unit-of-work';
import type { UnitOfWork } from '../../../shared/database/unit-of-work';
import { prefixedId } from '../../../shared/utils/id';
import { AccountType } from '../../../ledger/domain/entities/account.entity';
import { OpenAccountsUseCase } from '../../../ledger/application/use-cases/open-accounts.usecase';
import { Merchant } from '../../domain/entities/merchant.entity';
import { ApiKey, ApiKeyType } from '../../domain/entities/api-key.entity';
import {
  MERCHANT_CURRENCY,
  merchantAccounts,
} from '../../domain/merchant-accounts';
import { MERCHANT_REPOSITORY } from '../../domain/ports/merchant.repository';
import type { MerchantRepository } from '../../domain/ports/merchant.repository';
import { API_KEY_REPOSITORY } from '../../domain/ports/api-key.repository';
import type { ApiKeyRepository } from '../../domain/ports/api-key.repository';

// usual MDRs in Brazil: 0.99% on Pix, 2.99% on credit card
const DEFAULT_PIX_FEE_BPS = 99;
const DEFAULT_CARD_FEE_BPS = 299;

export type IssuedKey = { apiKey: ApiKey; plaintext: string };

export type OnboardedMerchant = {
  merchant: Merchant;
  secretKey: IssuedKey;
  publishableKey: IssuedKey;
};

@Injectable()
export class OnboardMerchantUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(MERCHANT_REPOSITORY) private readonly merchants: MerchantRepository,
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
    private readonly openAccounts: OpenAccountsUseCase,
  ) {}

  /** Merchant, ledger accounts and first keys exist together or not at all. */
  async execute(input: {
    name: string;
    pixFeeBps?: number;
    cardFeeBps?: number;
  }): Promise<OnboardedMerchant> {
    return this.uow.run(async () => {
      const now = new Date();
      const merchant = new Merchant(
        prefixedId('mch'),
        input.name,
        input.pixFeeBps ?? DEFAULT_PIX_FEE_BPS,
        input.cardFeeBps ?? DEFAULT_CARD_FEE_BPS,
        now,
      );
      await this.merchants.save(merchant);

      const accounts = merchantAccounts(merchant.id);
      await this.openAccounts.execute([
        {
          id: accounts.pending,
          type: AccountType.LIABILITY,
          currency: MERCHANT_CURRENCY,
        },
        {
          id: accounts.available,
          type: AccountType.LIABILITY,
          currency: MERCHANT_CURRENCY,
        },
      ]);

      const secretKey = ApiKey.issue(merchant.id, ApiKeyType.SECRET, now);
      const publishableKey = ApiKey.issue(
        merchant.id,
        ApiKeyType.PUBLISHABLE,
        now,
      );
      await this.apiKeys.save(secretKey.apiKey);
      await this.apiKeys.save(publishableKey.apiKey);

      return { merchant, secretKey, publishableKey };
    });
  }
}
