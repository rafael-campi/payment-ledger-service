import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlatformMerchantsController } from './interfaces/http/controllers/platform-merchants.controller';
import { AccountController } from './interfaces/http/controllers/account.controller';
import { ApiKeysController } from './interfaces/http/controllers/api-keys.controller';
import { MerchantAuthGuard } from './interfaces/http/merchant-auth.guard';
import { OnboardMerchantUseCase } from './application/use-cases/onboard-merchant.usecase';
import { AuthenticateApiKeyUseCase } from './application/use-cases/authenticate-api-key.usecase';
import { CreateApiKeyUseCase } from './application/use-cases/create-api-key.usecase';
import { ListApiKeysUseCase } from './application/use-cases/list-api-keys.usecase';
import { RevokeApiKeyUseCase } from './application/use-cases/revoke-api-key.usecase';
import { GetMerchantUseCase } from './application/use-cases/get-merchant.usecase';
import { GetMerchantBalanceUseCase } from './application/use-cases/get-merchant-balance.usecase';
import { UpdatePayoutKeyUseCase } from './application/use-cases/update-payout-key.usecase';
import { MERCHANT_REPOSITORY } from './domain/ports/merchant.repository';
import { API_KEY_REPOSITORY } from './domain/ports/api-key.repository';
import { TypeOrmMerchantRepository } from './infrastructure/persistence/typeorm/typeorm-merchant.repository';
import { TypeOrmApiKeyRepository } from './infrastructure/persistence/typeorm/typeorm-api-key.repository';

@Module({
  imports: [IdempotencyModule, LedgerModule],
  controllers: [
    PlatformMerchantsController,
    AccountController,
    ApiKeysController,
  ],
  providers: [
    MerchantAuthGuard,
    OnboardMerchantUseCase,
    AuthenticateApiKeyUseCase,
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    GetMerchantUseCase,
    GetMerchantBalanceUseCase,
    UpdatePayoutKeyUseCase,
    { provide: MERCHANT_REPOSITORY, useClass: TypeOrmMerchantRepository },
    { provide: API_KEY_REPOSITORY, useClass: TypeOrmApiKeyRepository },
  ],
  // other modules (payments) authenticate merchants with the same guard
  exports: [MerchantAuthGuard, AuthenticateApiKeyUseCase, GetMerchantUseCase],
})
export class MerchantsModule {}
