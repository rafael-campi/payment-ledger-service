import { Payout } from '../entities/payout.entity';

export const PAYOUT_REPOSITORY = Symbol('PAYOUT_REPOSITORY');

export interface PayoutRepository {
  save(payout: Payout): Promise<void>;
  update(payout: Payout): Promise<void>;
  /** Serializes payouts of one merchant until the unit of work ends. */
  lockMerchant(merchantId: string): Promise<void>;
  lockById(id: string): Promise<Payout | null>;
  findById(merchantId: string, id: string): Promise<Payout | null>;
  listByMerchant(merchantId: string, limit: number): Promise<Payout[]>;
  /** Pending payouts whose process died before the rail answered. */
  findStuckPending(createdBefore: Date, limit: number): Promise<Payout[]>;
}
