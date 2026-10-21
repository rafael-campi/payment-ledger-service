import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentMerchantId } from '../../../../shared/auth/principal';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { MerchantAuthGuard } from '../../../../merchants/interfaces/http/merchant-auth.guard';
import { CreateRefundUseCase } from '../../../application/use-cases/create-refund.usecase';
import { GetRefundUseCase } from '../../../application/use-cases/get-refund.usecase';
import { ListRefundsUseCase } from '../../../application/use-cases/list-refunds.usecase';
import {
  RefundResource,
  toRefundResource,
} from '../../../application/refund-resource';
import { CreateRefundDto, ListRefundsQueryDto } from '../dto/refunds.dto';

@Controller('v1/refunds')
@UseGuards(MerchantAuthGuard)
export class RefundsController {
  constructor(
    private readonly createRefund: CreateRefundUseCase,
    private readonly getRefund: GetRefundUseCase,
    private readonly listRefunds: ListRefundsUseCase,
  ) {}

  @Post()
  @Idempotent()
  async create(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: CreateRefundDto,
  ): Promise<RefundResource> {
    return toRefundResource(
      await this.createRefund.execute({
        merchantId,
        paymentId: dto.payment,
        amount: dto.amount,
        reason: dto.reason,
      }),
    );
  }

  @Get()
  async list(
    @CurrentMerchantId() merchantId: string,
    @Query() query: ListRefundsQueryDto,
  ): Promise<RefundResource[]> {
    const refunds = await this.listRefunds.execute(merchantId, {
      paymentId: query.payment,
      limit: query.limit ?? 20,
    });
    return refunds.map((r) => toRefundResource(r));
  }

  @Get(':id')
  async findOne(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<RefundResource> {
    return toRefundResource(await this.getRefund.execute(merchantId, id));
  }
}
