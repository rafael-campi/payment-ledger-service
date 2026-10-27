import { Merchant } from '../entities/merchant.entity';

export const MERCHANT_REPOSITORY = Symbol('MERCHANT_REPOSITORY');

export interface MerchantRepository {
  save(merchant: Merchant): Promise<void>;
  updatePayoutPixKey(id: string, pixKey: string): Promise<void>;
  findById(id: string): Promise<Merchant | null>;
  /** Locks the merchant row until the surrounding unit of work ends. */
  lockById(id: string): Promise<Merchant | null>;
}
