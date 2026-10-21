import { randomInt } from 'crypto';

const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomAlphanumeric(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUMERIC[randomInt(ALPHANUMERIC.length)];
  }
  return out;
}

/** txid of a dynamic charge: 26 to 35 alphanumerics (BCB); we use 32. */
export function generateTxid(): string {
  return randomAlphanumeric(32);
}

/**
 * endToEndId the SPI assigns to every Pix: "E" + payer's ISPB (8 digits) +
 * yyyyMMddHHmm (UTC) + 11 alphanumerics = 32 characters.
 */
export function generateEndToEndId(payerIspb: string, at: Date): string {
  const timestamp = at.toISOString().replace(/\D/g, '').slice(0, 12);
  return `E${payerIspb}${timestamp}${randomAlphanumeric(11)}`;
}
