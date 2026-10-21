import { randomBytes } from 'crypto';
import { prefixedId } from '../../../shared/utils/id';

export class WebhookEndpoint {
  constructor(
    public readonly id: string, // "we_..."
    public readonly merchantId: string,
    public readonly url: string,
    public readonly secret: string, // "whsec_...", signs every delivery
    public readonly createdAt: Date,
    public readonly disabledAt: Date | null = null,
  ) {}

  static create(merchantId: string, url: string, now: Date): WebhookEndpoint {
    return new WebhookEndpoint(
      prefixedId('we'),
      merchantId,
      url,
      `whsec_${randomBytes(24).toString('base64url')}`,
      now,
    );
  }

  get isActive(): boolean {
    return this.disabledAt === null;
  }

  get maskedSecret(): string {
    return `whsec_…${this.secret.slice(-4)}`;
  }

  disable(at: Date): WebhookEndpoint {
    if (!this.isActive) return this;
    return new WebhookEndpoint(
      this.id,
      this.merchantId,
      this.url,
      this.secret,
      this.createdAt,
      at,
    );
  }
}
