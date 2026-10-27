import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'PSP-Signature';

/** Deliveries older than this are rejected by verifySignature (replay protection). */
const DEFAULT_TOLERANCE_SECONDS = 300;

/** `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>` (ADR 0003). */
export function signPayload(
  secret: string,
  body: string,
  timestamp: number,
): string {
  return `t=${timestamp},v1=${hmac(secret, timestamp, body)}`;
}

/**
 * What a merchant runs on every delivery, against the raw request body.
 * Kept here so the PSP's own tests prove the contract it documents.
 */
export function verifySignature(
  header: string | undefined,
  body: string,
  secret: string,
  {
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
    now = Date.now(),
  }: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  if (!header) return false;

  const parts = header.split(',').map((p) => p.split('=', 2));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isInteger(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = Buffer.from(hmac(secret, timestamp, body), 'hex');
  return signatures.some((signature) => {
    const given = Buffer.from(signature ?? '', 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function hmac(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}
