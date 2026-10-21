import { Module } from '@nestjs/common';
import { MerchantsModule } from '../merchants/merchants.module';
import { RailsModule } from '../rails/rails.module';
import { TokensController } from './interfaces/http/tokens.controller';
import { TokenizeCardUseCase } from './application/use-cases/tokenize-card.usecase';
import { ReserveCardTokenUseCase } from './application/use-cases/reserve-card-token.usecase';
import { AuthorizeWithCardUseCase } from './application/use-cases/authorize-with-card.usecase';
import { PurgeCardUseCase } from './application/use-cases/purge-card.usecase';
import { PurgeExpiredTokensUseCase } from './application/use-cases/purge-expired-tokens.usecase';
import { CARD_CIPHER } from './domain/ports/card-cipher';
import { VAULT_REPOSITORY } from './domain/ports/vault.repository';
import { AesGcmCardCipher } from './infrastructure/crypto/aes-gcm-card-cipher';
import { TypeOrmVaultRepository } from './infrastructure/persistence/typeorm/typeorm-vault.repository';
import { PurgeExpiredTokensJob } from './infrastructure/jobs/purge-expired-tokens.job';

/**
 * Card Vault (ADR 0002): the only module that ever holds a card number.
 * It exports operations on tokens, never the number itself.
 */
@Module({
  imports: [MerchantsModule, RailsModule],
  controllers: [TokensController],
  providers: [
    TokenizeCardUseCase,
    ReserveCardTokenUseCase,
    AuthorizeWithCardUseCase,
    PurgeCardUseCase,
    PurgeExpiredTokensUseCase,
    PurgeExpiredTokensJob,
    { provide: CARD_CIPHER, useFactory: () => AesGcmCardCipher.fromEnv() },
    { provide: VAULT_REPOSITORY, useClass: TypeOrmVaultRepository },
  ],
  exports: [
    ReserveCardTokenUseCase,
    AuthorizeWithCardUseCase,
    PurgeCardUseCase,
  ],
})
export class VaultModule {}
