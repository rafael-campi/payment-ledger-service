import { Inject, Injectable } from '@nestjs/common';
import { Refund } from '../../domain/entities/refund.entity';
import { REFUND_REPOSITORY } from '../../domain/ports/refund.repository';
import type { RefundRepository } from '../../domain/ports/refund.repository';

@Injectable()
export class ListRefundsUseCase {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
  ) {}

  /** Newest first, optionally of one payment. */
  execute(
    merchantId: string,
    filter: { paymentId?: string; limit: number },
  ): Promise<Refund[]> {
    return this.refunds.listByMerchant(merchantId, filter);
  }
}
