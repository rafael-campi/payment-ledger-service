import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentMerchantId } from '../../../../shared/auth/principal';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { MerchantAuthGuard } from '../../../../merchants/interfaces/http/merchant-auth.guard';
import {
  PaymentResource,
  toPaymentResource,
} from '../../../application/payment-resource';
import { CreatePaymentUseCase } from '../../../application/use-cases/create-payment.usecase';
import { GetPaymentUseCase } from '../../../application/use-cases/get-payment.usecase';
import { ListPaymentsUseCase } from '../../../application/use-cases/list-payments.usecase';
import { CancelPaymentUseCase } from '../../../application/use-cases/cancel-payment.usecase';
import { CapturePaymentUseCase } from '../../../application/use-cases/capture-payment.usecase';
import { CreatePaymentDto, ListPaymentsQueryDto } from '../dto/payments.dto';

@Controller('v1/payments')
@UseGuards(MerchantAuthGuard)
export class PaymentsController {
  constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly getPayment: GetPaymentUseCase,
    private readonly listPayments: ListPaymentsUseCase,
    private readonly cancelPayment: CancelPaymentUseCase,
    private readonly capturePayment: CapturePaymentUseCase,
  ) {}

  @Post()
  @Idempotent()
  async create(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentResource> {
    const payment = await this.createPayment.execute({
      merchantId,
      amount: dto.amount,
      currency: dto.currency,
      method: dto.method,
      description: dto.description,
      metadata: dto.metadata,
      expiresInSeconds: dto.expiresInSeconds,
      card: dto.card,
      capture: dto.capture,
    });
    return toPaymentResource(payment);
  }

  @Get()
  async list(
    @CurrentMerchantId() merchantId: string,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaymentResource[]> {
    const payments = await this.listPayments.execute(
      merchantId,
      query.limit ?? 20,
    );
    return payments.map((p) => toPaymentResource(p));
  }

  @Get(':id')
  async findOne(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<PaymentResource> {
    return toPaymentResource(await this.getPayment.execute(merchantId, id));
  }

  @Post(':id/capture')
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  async capture(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<PaymentResource> {
    return toPaymentResource(await this.capturePayment.execute(merchantId, id));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  async cancel(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<PaymentResource> {
    return toPaymentResource(await this.cancelPayment.execute(merchantId, id));
  }
}
