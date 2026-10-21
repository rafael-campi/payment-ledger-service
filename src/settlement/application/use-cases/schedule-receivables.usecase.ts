import { Inject, Injectable } from '@nestjs/common';
import { prefixedId } from '../../../shared/utils/id';
import { Receivable } from '../../domain/entities/receivable.entity';
import { releaseSchedule } from '../../domain/schedule';
import { RECEIVABLE_REPOSITORY } from '../../domain/ports/receivable.repository';
import type { ReceivableRepository } from '../../domain/ports/receivable.repository';

@Injectable()
export class ScheduleReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivables: ReceivableRepository,
  ) {}

  /**
   * Called in the unit of work that credits merchant:pending with a
   * payment's net amount, so the money always has a release date.
   */
  async execute(input: {
    merchantId: string;
    paymentId: string;
    net: number;
    currency: string;
    method: 'pix' | 'credit_card';
    installments: number;
    at: Date;
  }): Promise<Receivable[]> {
    const parts = releaseSchedule(input).map(
      (part) =>
        new Receivable(
          prefixedId('rcv'),
          input.merchantId,
          input.paymentId,
          part.installment,
          part.amount,
          0,
          input.currency,
          part.availableOn,
          null,
          input.at,
        ),
    );
    await this.receivables.saveAll(parts);
    return parts;
  }
}
