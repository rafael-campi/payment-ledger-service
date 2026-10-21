import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors';
import { Refund } from '../../domain/entities/refund.entity';
import { REFUND_REPOSITORY } from '../../domain/ports/refund.repository';
import type { RefundRepository } from '../../domain/ports/refund.repository';

@Injectable()
export class GetRefundUseCase {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
  ) {}

  async execute(merchantId: string, id: string): Promise<Refund> {
    const refund = await this.refunds.findById(merchantId, id);
    if (!refund) {
      throw new NotFoundError(
        'refunds.not_found',
        `Refund ${id} does not exist.`,
      );
    }
    return refund;
  }
}
