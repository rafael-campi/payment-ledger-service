import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedRequest,
  bearerToken,
} from '../../../shared/auth/principal';
import { ApiKeyType } from '../../domain/entities/api-key.entity';
import { AuthenticateApiKeyUseCase } from '../../application/use-cases/authenticate-api-key.usecase';

const ALLOW_PUBLISHABLE_KEY = 'auth:allowPublishableKey';

/** Lets a route accept the publishable key (pk_), meant for browsers. */
export const AllowPublishableKey = () =>
  SetMetadata(ALLOW_PUBLISHABLE_KEY, true);

/** Authenticates /v1 calls with "Authorization: Bearer sk_test_...". */
@Injectable()
export class MerchantAuthGuard implements CanActivate {
  constructor(
    private readonly authenticate: AuthenticateApiKeyUseCase,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Provide your API key as "Authorization: Bearer sk_test_...".',
      );
    }

    const apiKey = await this.authenticate.execute(token);
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key.');
    }
    // a publishable key is public by design: it may only tokenize cards
    const allowPublishable = this.reflector.get<boolean>(
      ALLOW_PUBLISHABLE_KEY,
      context.getHandler(),
    );
    if (apiKey.type !== ApiKeyType.SECRET && !allowPublishable) {
      throw new ForbiddenException('This endpoint requires a secret key.');
    }

    request.principal = {
      kind: 'merchant',
      merchantId: apiKey.merchantId,
      apiKeyId: apiKey.id,
    };
    return true;
  }
}
