import { Module } from '@nestjs/common';
import { LedgerModule } from './ledger/ledger.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [LedgerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
