import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors';
import { Payment } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository';
import type { PaymentRepository } from '../../domain/ports/payment.repository';

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
  ) {}

  async execute(merchantId: string, id: string): Promise<Payment> {
    const payment = await this.payments.findById(merchantId, id);
    if (!payment) {
      throw new NotFoundError(
        'payments.not_found',
        `Payment ${id} does not exist.`,
      );
    }
    return payment;
  }
}
