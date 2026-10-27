import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { CurrentMerchantId } from '../../../../shared/auth/principal';
import { MerchantAuthGuard } from '../merchant-auth.guard';
import { GetMerchantUseCase } from '../../../application/use-cases/get-merchant.usecase';
import { GetMerchantBalanceUseCase } from '../../../application/use-cases/get-merchant-balance.usecase';
import { UpdatePayoutKeyUseCase } from '../../../application/use-cases/update-payout-key.usecase';
import { BalanceDto, MerchantDto, UpdateAccountDto } from '../dto/merchant.dto';

@Controller('v1')
@UseGuards(MerchantAuthGuard)
export class AccountController {
  constructor(
    private readonly getMerchant: GetMerchantUseCase,
    private readonly getBalance: GetMerchantBalanceUseCase,
    private readonly updatePayoutKey: UpdatePayoutKeyUseCase,
  ) {}

  @Get('account')
  async account(@CurrentMerchantId() merchantId: string): Promise<MerchantDto> {
    return MerchantDto.from(await this.getMerchant.execute(merchantId));
  }

  @Patch('account')
  @Idempotent()
  async update(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<MerchantDto> {
    return MerchantDto.from(
      await this.updatePayoutKey.execute(merchantId, dto.payoutPixKey),
    );
  }

  @Get('balance')
  balance(@CurrentMerchantId() merchantId: string): Promise<BalanceDto> {
    return this.getBalance.execute(merchantId);
  }
}
