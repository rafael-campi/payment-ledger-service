import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UnprocessableEntityException,
  UseInterceptors,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/principal';
import { IdempotencyStore } from './idempotency.store';

const MAX_KEY_LENGTH = 255;
const IDEMPOTENCY_OPTIONS = 'idempotency:options';

export interface IdempotentOptions {
  /**
   * What to keep for replays. Use it to drop secrets (e.g. a freshly issued
   * API key) so they are shown once and never persisted in plaintext.
   */
  storeAs?: (body: unknown) => unknown;
}

/**
 * Stripe-style Idempotency-Key handling (ADR 0004): same key and body replays
 * the stored response, same key with another body is 422, a request still
 * running is 409. Failed requests are not stored. Keys are scoped per caller,
 * so two merchants never collide.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const options =
      this.reflector.get<IdempotentOptions>(
        IDEMPOTENCY_OPTIONS,
        context.getHandler(),
      ) ?? {};

    const key = request.header('Idempotency-Key');
    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    if (key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters.`,
      );
    }

    const scope = scopeOf(request);
    const claim = await this.store.claim(scope, key, hashRequest(request));
    switch (claim.kind) {
      case 'mismatch':
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request.',
        );
      case 'in_progress':
        throw new ConflictException(
          'A request with this Idempotency-Key is still being processed.',
        );
      case 'completed':
        response.setHeader('Idempotent-Replayed', 'true');
        return of(claim.body);
    }

    // interceptors run before Nest sets the status, so read what the route will send
    const status =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ??
      (request.method === 'POST' ? 201 : 200);
    const storeAs = options.storeAs ?? ((body: unknown) => body);

    return next.handle().pipe(
      mergeMap((body) =>
        from(this.store.complete(scope, key, status, storeAs(body))).pipe(
          mergeMap(() => of(body)),
        ),
      ),
      catchError((error: unknown) =>
        from(this.store.release(scope, key)).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}

export const Idempotent = (options: IdempotentOptions = {}) =>
  applyDecorators(
    SetMetadata(IDEMPOTENCY_OPTIONS, options),
    UseInterceptors(IdempotencyInterceptor),
  );

function scopeOf(request: AuthenticatedRequest): string {
  // guards run before interceptors, so the caller is already known
  switch (request.principal?.kind) {
    case 'merchant':
      return request.principal.merchantId;
    case 'platform':
      return 'platform';
    default:
      throw new Error('Idempotent route has no authentication guard');
  }
}

function hashRequest(request: Request): string {
  return createHash('sha256')
    .update(`${request.method} ${request.originalUrl}\n`)
    .update(canonicalJson(request.body ?? null))
    .digest('hex');
}

// key order must not make the same body look like a different request
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
