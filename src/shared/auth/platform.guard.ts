import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest, bearerToken, safeEqual } from './principal';

/**
 * Operator access (onboarding, raw ledger). Fails closed: with no
 * PLATFORM_ADMIN_TOKEN configured, nobody gets in.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const expected = process.env.PLATFORM_ADMIN_TOKEN;
    const token = bearerToken(request);

    if (!expected || !token || !safeEqual(token, expected)) {
      throw new UnauthorizedException('A valid platform token is required.');
    }
    request.principal = { kind: 'platform' };
    return true;
  }
}
