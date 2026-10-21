import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DomainError, NotFoundError } from '../shared/errors';
import { FindPaymentByTxidUseCase } from '../payments/application/use-cases/find-payment-by-txid.usecase';
import { ReceivePixUseCase } from '../payments/application/use-cases/receive-pix.usecase';
import { generateEndToEndId } from '../payments/domain/pix/identifiers';

// ISPB the simulated payer's bank reports in every endToEndId
const PAYER_ISPB = '99999999';

export class PayPixDto {
  /** Defaults to the charge amount; a different value lands in suspense. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;
}

/**
 * Plays the payer and their bank (ADR 0001): "pays" a charge and lets the
 * SPI credit our settlement account. Only mounted when SIMULATORS_ENABLED.
 */
@Controller('simulator/pix')
export class PixSimulatorController {
  constructor(
    private readonly findPayment: FindPaymentByTxidUseCase,
    private readonly receivePix: ReceivePixUseCase,
  ) {}

  @Post(':txid/pay')
  @HttpCode(HttpStatus.OK)
  async pay(@Param('txid') txid: string, @Body() dto: PayPixDto) {
    const payment = await this.findPayment.execute(txid);
    if (!payment) {
      throw new NotFoundError(
        'simulator.charge_not_found',
        `No Pix charge with txid ${txid}.`,
      );
    }
    const now = new Date();
    // a payer's bank refuses dynamic QR codes that were paid, canceled or expired
    if (!payment.isPayableAt(now)) {
      throw new DomainError(
        'simulator.charge_not_payable',
        `Charge ${txid} is ${payment.status} and cannot be paid.`,
      );
    }

    const endToEndId = generateEndToEndId(PAYER_ISPB, now);
    const { outcome } = await this.receivePix.execute({
      txid,
      endToEndId,
      amount: dto.amount ?? payment.amount,
      paidAt: now,
    });
    return { endToEndId, outcome };
  }
}
