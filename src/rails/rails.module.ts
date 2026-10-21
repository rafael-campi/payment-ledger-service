import { Module } from '@nestjs/common';
import { ACQUIRER_RAIL } from './acquirer-rail';
import { SimulatedAcquirer } from './simulated-acquirer';
import { PIX_RAIL } from './pix-rail';
import { SimulatedPixRail } from './simulated-pix-rail';

/** External payment networks; only simulators while ADR 0001 holds. */
@Module({
  providers: [
    { provide: ACQUIRER_RAIL, useClass: SimulatedAcquirer },
    { provide: PIX_RAIL, useClass: SimulatedPixRail },
  ],
  exports: [ACQUIRER_RAIL, PIX_RAIL],
})
export class RailsModule {}
