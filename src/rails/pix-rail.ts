export const PIX_RAIL = Symbol('PIX_RAIL');

/** A definitive answer from a rail; a thrown error means "no answer yet". */
export type RailResult<T> = ({ ok: true } & T) | { ok: false; reason: string };

/**
 * The Pix rail (ADR 0001): the PSP's settlement bank on the SPI. Money
 * arriving comes back through ReceivePixUseCase.
 */
export interface PixRail {
  /** Registers a dynamic charge (QR Code) for a payer to pay. */
  createCharge(input: {
    txid: string;
    amount: number; // cents
    expiresAt: Date;
    merchantName: string;
  }): Promise<{ copiaECola: string }>;

  /** Devolução of a received Pix to its payer. Idempotent on idempotencyKey. */
  refund(input: {
    endToEndId: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<RailResult<{ returnId: string }>>;

  /** Sends a Pix from the settlement account to a key. Idempotent on idempotencyKey. */
  send(input: {
    pixKey: string;
    amount: number;
    idempotencyKey: string;
    description: string;
  }): Promise<RailResult<{ endToEndId: string }>>;
}
