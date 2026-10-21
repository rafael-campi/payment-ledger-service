import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { LedgerModule } from './ledger/ledger.module';
import { MerchantsModule } from './merchants/merchants.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { VaultModule } from './vault/vault.module';
import { SettlementModule } from './settlement/settlement.module';
import { DatabaseModule } from './shared/database/database.module';
import { DomainErrorFilter } from './shared/http/domain-error.filter';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    DatabaseModule,
    LedgerModule,
    MerchantsModule,
    WebhooksModule,
    VaultModule,
    SettlementModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
