import { randomBytes, randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

/** Stripe-style public id, e.g. "mch_3f9a1c..." — the prefix tells what it is. */
export function prefixedId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}
