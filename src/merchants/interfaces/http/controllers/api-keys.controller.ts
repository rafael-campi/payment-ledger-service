import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentMerchantId } from '../../../../shared/auth/principal';
import { Idempotent } from '../../../../shared/idempotency/idempotency.interceptor';
import { MerchantAuthGuard } from '../merchant-auth.guard';
import { CreateApiKeyUseCase } from '../../../application/use-cases/create-api-key.usecase';
import { ListApiKeysUseCase } from '../../../application/use-cases/list-api-keys.usecase';
import { RevokeApiKeyUseCase } from '../../../application/use-cases/revoke-api-key.usecase';
import { ApiKeyDto, CreateApiKeyDto } from '../dto/merchant.dto';

@Controller('v1/api_keys')
@UseGuards(MerchantAuthGuard)
export class ApiKeysController {
  constructor(
    private readonly createKey: CreateApiKeyUseCase,
    private readonly listKeys: ListApiKeysUseCase,
    private readonly revokeKey: RevokeApiKeyUseCase,
  ) {}

  @Get()
  async list(@CurrentMerchantId() merchantId: string): Promise<ApiKeyDto[]> {
    const keys = await this.listKeys.execute(merchantId);
    return keys.map((key) => ApiKeyDto.from(key));
  }

  @Post()
  @Idempotent({ storeAs: (body) => ApiKeyDto.masked(body as ApiKeyDto) })
  async create(
    @CurrentMerchantId() merchantId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKeyDto> {
    const { apiKey, plaintext } = await this.createKey.execute(
      merchantId,
      dto.type,
    );
    return ApiKeyDto.from(apiKey, plaintext);
  }

  @Delete(':id')
  @Idempotent()
  async revoke(
    @CurrentMerchantId() merchantId: string,
    @Param('id') id: string,
  ): Promise<ApiKeyDto> {
    return ApiKeyDto.from(await this.revokeKey.execute(merchantId, id));
  }
}
