import { Inject, Injectable } from '@nestjs/common';
import { Payout } from '../../domain/entities/payout.entity';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout.repository';
import type { PayoutRepository } from '../../domain/ports/payout.repository';

@Injectable()
export class ListPayoutsUseCase {
  constructor(
    @Inject(PAYOUT_REPOSITORY) private readonly payouts: PayoutRepository,
  ) {}

  /** Newest first. */
  execute(merchantId: string, limit: number): Promise<Payout[]> {
    return this.payouts.listByMerchant(merchantId, limit);
  }
}
