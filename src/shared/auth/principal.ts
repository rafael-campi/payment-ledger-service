import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/** Who is calling, set by PlatformGuard or MerchantAuthGuard. */
export type Principal =
  | { kind: 'platform' }
  | { kind: 'merchant'; merchantId: string; apiKeyId: string };

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

export function bearerToken(request: Request): string | null {
  const [scheme, token] = (request.header('Authorization') ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/** Constant-time comparison that does not leak the expected length. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export const CurrentMerchantId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const { principal } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (principal?.kind !== 'merchant') {
      throw new Error(
        'CurrentMerchantId used on a route without MerchantAuthGuard',
      );
    }
    return principal.merchantId;
  },
);
