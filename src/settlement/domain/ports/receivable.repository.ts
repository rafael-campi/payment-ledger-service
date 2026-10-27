import { Receivable } from '../entities/receivable.entity';

export const RECEIVABLE_REPOSITORY = Symbol('RECEIVABLE_REPOSITORY');

export type ReceivableReversal = { receivableId: string; amount: number };

export interface ReceivableRepository {
  saveAll(receivables: Receivable[]): Promise<void>;
  /** Due and unreleased, skipping rows another worker holds. */
  lockDue(now: Date, limit: number): Promise<Receivable[]>;
  /** Unreleased parts of a payment, latest first, locked. */
  lockUnreleased(paymentId: string): Promise<Receivable[]>;
  lockByIds(ids: string[]): Promise<Receivable[]>;
  markReleased(id: string, at: Date): Promise<void>;
  addReversed(id: string, delta: number): Promise<void>;
  listByMerchant(
    merchantId: string,
    filter: { released?: boolean; limit: number },
  ): Promise<Receivable[]>;
}
