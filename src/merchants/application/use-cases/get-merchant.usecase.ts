import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors';
import { Merchant } from '../../domain/entities/merchant.entity';
import { MERCHANT_REPOSITORY } from '../../domain/ports/merchant.repository';
import type { MerchantRepository } from '../../domain/ports/merchant.repository';

@Injectable()
export class GetMerchantUseCase {
  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchants: MerchantRepository,
  ) {}

  async execute(id: string): Promise<Merchant> {
    const merchant = await this.merchants.findById(id);
    if (!merchant) {
      throw new NotFoundError(
        'merchants.not_found',
        `Merchant ${id} does not exist.`,
      );
    }
    return merchant;
  }
}
