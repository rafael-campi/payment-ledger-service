import type { RailResult } from './pix-rail';

export const ACQUIRER_RAIL = Symbol('ACQUIRER_RAIL');

export type AuthorizationResult =
  | { approved: true; authorizationId: string }
  | { approved: false; declineCode: string };

/**
 * The card network side (ADR 0001): an acquirer such as Cielo, Rede or
 * Getnet. Only the Card Vault calls authorize, because only it holds the
 * card number; capture and void need just the authorization id.
 */
export interface AcquirerRail {
  /** Idempotent on idempotencyKey: a retry returns the same answer. */
  authorize(input: {
    idempotencyKey: string;
    pan: string;
    expMonth: number;
    expYear: number;
    amount: number; // cents
    installments: number;
  }): Promise<AuthorizationResult>;
  capture(authorizationId: string, amount: number): Promise<void>;
  void(authorizationId: string): Promise<void>;
  /** Returns captured money to the card. Idempotent on idempotencyKey. */
  refund(input: {
    authorizationId: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<RailResult<{ refundId: string }>>;
}
