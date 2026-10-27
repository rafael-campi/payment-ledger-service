import { Inject, Injectable } from '@nestjs/common';
import { Payment } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';

/** What a payer's bank sees when it reads one of our QR codes. */
@Injectable()
export class FindPaymentByTxidUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
  ) {}

  execute(txid: string): Promise<Payment | null> {
    return this.payments.findByTxid(txid);
  }
}
