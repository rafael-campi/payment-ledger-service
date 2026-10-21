import { createHash, randomBytes } from 'crypto';
import { prefixedId } from '../../../shared/utils/id';

export enum ApiKeyType {
  SECRET = 'secret', // server-side calls; never leaves the merchant's backend
  PUBLISHABLE = 'publishable', // browser-side card tokenization only
}

// only test mode exists while the rails are simulated (ADR 0001)
const PREFIX: Record<ApiKeyType, string> = {
  [ApiKeyType.SECRET]: 'sk_test_',
  [ApiKeyType.PUBLISHABLE]: 'pk_test_',
};

/** Keys are 192 random bits, so a plain SHA-256 is enough to store them safely. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export class ApiKey {
  constructor(
    public readonly id: string, // "key_..."
    public readonly merchantId: string,
    public readonly type: ApiKeyType,
    public readonly keyHash: string,
    public readonly last4: string,
    public readonly createdAt: Date,
    public readonly revokedAt: Date | null = null,
  ) {}

  /** The plaintext exists only in the return value; only its hash is kept. */
  static issue(
    merchantId: string,
    type: ApiKeyType,
    now: Date,
  ): { apiKey: ApiKey; plaintext: string } {
    const plaintext = PREFIX[type] + randomBytes(24).toString('base64url');
    const apiKey = new ApiKey(
      prefixedId('key'),
      merchantId,
      type,
      hashApiKey(plaintext),
      plaintext.slice(-4),
      now,
    );
    return { apiKey, plaintext };
  }

  get isActive(): boolean {
    return this.revokedAt === null;
  }

  /** Safe to show: "sk_test_…a1b2". */
  get masked(): string {
    return `${PREFIX[this.type]}…${this.last4}`;
  }

  revoke(at: Date): ApiKey {
    if (!this.isActive) return this;
    return new ApiKey(
      this.id,
      this.merchantId,
      this.type,
      this.keyHash,
      this.last4,
      this.createdAt,
      at,
    );
  }
}
