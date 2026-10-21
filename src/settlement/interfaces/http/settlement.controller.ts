import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentMerchantId } from '../../../shared/auth/principal';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor';
import { MerchantAuthGuard } from '../../../merchants/interfaces/http/merchant-auth.guard';
import { ListReceivablesUseCase } from '../../application/use-cases/list-receivables.usecase';
import { CreatePayoutUseCase } from '../../application/use-cases/create-payout.usecase';
import { GetPayoutUseCase } from '../../application/use-cases/get-payout.usecase';
import { ListPayoutsUseCase } from '../../application/use-cases/list-payouts.usecase';
import {
  PayoutResource,
  ReceivableResource,
  toPayoutResource,
  toReceivableResource,
} from '../../application/resources';
import {
  CreatePayoutDto,
  ListQueryDto,
  ListReceivablesQueryDto,
} from './dto/settlement.dto';

@Controller('v1')
@UseGuards(MerchantAuthGuard)
export class SettlementController {
  constructor(
    private readonly listReceivables: ListReceivablesUseCase,
    private readonly createPayout: CreatePayoutUseCase,
    private readonly getPayout: GetPayoutUseCase,
    private readonly listPayouts: ListPayoutsUseCase,
  ) {}

  /** The receivables schedule ("agenda de recebíveis"), soonest first. */
  @Get('receivables')
  async receivables(
    @CurrentMerchantId() merchantId: string,
    @Query() query: ListReceivablesQueryDto,
  ): Promise<ReceivableResource[]> {
    const list = await this.listReceivables.execute(merchantId, {
      released: query.released,
      limit: query.limit ?? 50,
    });
    return list.map((r) => toReceivableResource(r));
  }

  @Post('payouts')
  @Idempotent()
  async payout(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: CreatePayoutDto,
  ): Promise<PayoutResource> {
    return toPayoutResource(
      await this.createPayout.execute(merchantId, dto.amount),
    );
  }

  @Get('payouts')
  async payouts(
    @CurrentMerchantId() merchantId: string,
    @Query() query: ListQueryDto,
  ): Promise<PayoutResource[]> {
    const list = await this.listPayouts.execute(merchantId, query.limit ?? 20);
    return list.map((p) => toPayoutResource(p));
  }

  @Get('payouts/:id')
  async payoutById(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<PayoutResource> {
    return toPayoutResource(await this.getPayout.execute(merchantId, id));
  }
}
