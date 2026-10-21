import { Refund } from '../entities/refund.entity';

export const REFUND_REPOSITORY = Symbol('REFUND_REPOSITORY');

export interface RefundRepository {
  save(refund: Refund): Promise<void>;
  update(refund: Refund): Promise<void>;
  lockById(id: string): Promise<Refund | null>;
  /** Scoped by merchant: another merchant's refund is reported as missing. */
  findById(merchantId: string, id: string): Promise<Refund | null>;
  listByMerchant(
    merchantId: string,
    filter: { paymentId?: string; limit: number },
  ): Promise<Refund[]>;
  /** Pending refunds whose process died before the rail answered. */
  findStuckPending(createdBefore: Date, limit: number): Promise<Refund[]>;
}
