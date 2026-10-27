import { Inject, Injectable } from '@nestjs/common';
import { normalizePixKey } from '../../../rails/pix-key';
import { Merchant } from '../../domain/entities/merchant.entity';
import { MERCHANT_REPOSITORY } from '../../domain/ports/merchant.repository';
import type { MerchantRepository } from '../../domain/ports/merchant.repository';
import { GetMerchantUseCase } from './get-merchant.usecase';

@Injectable()
export class UpdatePayoutKeyUseCase {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchants: MerchantRepository,
    private readonly getMerchant: GetMerchantUseCase,
  ) {}

  /** Sets where payouts go. The key is validated and stored canonical. */
  async execute(merchantId: string, pixKey: string): Promise<Merchant> {
    await this.merchants.updatePayoutPixKey(
      merchantId,
      normalizePixKey(pixKey),
    );
    return this.getMerchant.execute(merchantId);
  }
}
