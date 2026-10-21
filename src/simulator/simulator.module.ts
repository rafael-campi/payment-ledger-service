import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PixSimulatorController } from './pix-simulator.controller';

/** The outside world for development and tests; never mounted in production. */
@Module({
  imports: [PaymentsModule],
  controllers: [PixSimulatorController],
})
export class SimulatorModule {}
