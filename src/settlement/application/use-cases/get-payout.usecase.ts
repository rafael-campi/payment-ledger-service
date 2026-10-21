import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors';
import { Payout } from '../../domain/entities/payout.entity';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout.repository';
import type { PayoutRepository } from '../../domain/ports/payout.repository';

@Injectable()
export class GetPayoutUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: PayoutRepository,
  ) {}

  async execute(merchantId: string, id: string): Promise<Payout> {
    const payout = await this.payouts.findById(merchantId, id);
    if (!payout) {
      throw new NotFoundError(
        'settlement.payout_not_found',
        `Payout ${id} does not exist.`,
      );
    }
    return payout;
  }
}
