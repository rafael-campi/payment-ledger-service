import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformGuard } from '../../../../shared/auth/platform.guard';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { OnboardMerchantUseCase } from '../../../application/use-cases/onboard-merchant.usecase';
import { GetMerchantUseCase } from '../../../application/use-cases/get-merchant.usecase';
import {
  MerchantDto,
  OnboardedMerchantDto,
  OnboardMerchantDto,
} from '../dto/merchant.dto';

/** Operator onboarding. Merchants manage themselves through /v1. */
@Controller('platform/merchants')
@UseGuards(PlatformGuard)
export class PlatformMerchantsController {
  constructor(
    private readonly onboard: OnboardMerchantUseCase,
    private readonly getMerchant: GetMerchantUseCase,
  ) {}

  @Post()
  @Idempotent({
    storeAs: (body) =>
      OnboardedMerchantDto.masked(body as OnboardedMerchantDto),
  })
  async create(@Body() dto: OnboardMerchantDto): Promise<OnboardedMerchantDto> {
    return OnboardedMerchantDto.fromOnboarded(
      await this.onboard.execute({
        name: dto.name,
        pixFeeBps: dto.pixFeeBps,
        cardFeeBps: dto.cardFeeBps,
      }),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<MerchantDto> {
    return MerchantDto.from(await this.getMerchant.execute(id));
  }
}
