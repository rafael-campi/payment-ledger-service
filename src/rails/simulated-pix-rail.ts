import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { buildDynamicBrCode } from '../payments/domain/pix/br-code';
import { PixRail, RailResult } from './pix-rail';

const LOCATION_HOST = 'pix.simulator.local/qr/v2';
const MERCHANT_CITY = 'SAO PAULO';
// ISPB the simulated settlement bank of the PSP reports
const PSP_ISPB = '12345678';

/** Keys the simulated SPI does not know: sending to them fails for good. */
export const UNKNOWN_PIX_KEYS = ['naoexiste@pix.example'];

/**
 * Stands in for the settlement bank (ADR 0001). The charge payload is a
 * valid BR Code, so banking apps can parse it, but its location URL resolves
 * nowhere: payments go through POST /simulator/pix/:txid/pay. Outgoing Pix
 * always succeed except to UNKNOWN_PIX_KEYS; ids derive from the idempotency
 * key, so retries get the same answer without any state.
 */
@Injectable()
export class SimulatedPixRail implements PixRail {
  createCharge(input: {
    txid: string;
    amount: number;
    expiresAt: Date;
    merchantName: string;
  }): Promise<{ copiaECola: string }> {
    return Promise.resolve({
      copiaECola: buildDynamicBrCode({
        location: `${LOCATION_HOST}/${input.txid}`,
        amount: input.amount,
        merchantName: input.merchantName,
        merchantCity: MERCHANT_CITY,
      }),
    });
  }

  refund(input: {
    idempotencyKey: string;
  }): Promise<RailResult<{ returnId: string }>> {
    // devolução ids start with "D" and have the shape of an endToEndId
    return Promise.resolve({
      ok: true,
      returnId: `D${PSP_ISPB}${digest(input.idempotencyKey, 23)}`,
    });
  }

  send(input: {
    pixKey: string;
    idempotencyKey: string;
  }): Promise<RailResult<{ endToEndId: string }>> {
    if (UNKNOWN_PIX_KEYS.includes(input.pixKey)) {
      return Promise.resolve({ ok: false, reason: 'pix_key_not_found' });
    }
    return Promise.resolve({
      ok: true,
      endToEndId: `E${PSP_ISPB}${digest(input.idempotencyKey, 23)}`,
    });
  }
}

function digest(key: string, length: number): string {
  return createHash('sha256').update(key).digest('hex').slice(0, length);
}
