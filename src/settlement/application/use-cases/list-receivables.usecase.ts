import { Inject, Injectable } from '@nestjs/common';
import { Receivable } from '../../domain/entities/receivable.entity';
import { RECEIVABLE_REPOSITORY } from '../../domain/ports/receivable.repository';
import type { ReceivableRepository } from '../../domain/ports/receivable.repository';

@Injectable()
export class ListReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivables: ReceivableRepository,
  ) {}

  /** The merchant's schedule, soonest first. */
  execute(
    merchantId: string,
    filter: { released?: boolean; limit: number },
  ): Promise<Receivable[]> {
    return this.receivables.listByMerchant(merchantId, filter);
  }
}
