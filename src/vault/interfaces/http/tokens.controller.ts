import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentMerchantId } from '../../../shared/auth/principal';
import {
  AllowPublishableKey,
  MerchantAuthGuard,
} from '../../../merchants/interfaces/http/merchant-auth.guard';
import { TokenizeCardUseCase } from '../../application/use-cases/tokenize-card.usecase';
import { TokenDto, TokenizeCardDto } from './dto/tokenize-card.dto';

/**
 * Called from the payer's browser with the publishable key, so card
 * numbers reach the PSP without passing through the merchant's servers.
 *
 * No Idempotency-Key here on purpose: the stored request hash would be a
 * hash of the card number, which is cheap to brute-force. A duplicate token
 * moves no money and expires unused.
 */
@Controller('v1/tokens')
@UseGuards(MerchantAuthGuard)
export class TokensController {
  constructor(private readonly tokenize: TokenizeCardUseCase) {}

  @Post()
  @AllowPublishableKey()
  async create(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: TokenizeCardDto,
  ): Promise<TokenDto> {
    return TokenDto.from(await this.tokenize.execute(merchantId, dto.card));
  }
}
