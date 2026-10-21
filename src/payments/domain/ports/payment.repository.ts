import { Payment } from '../entities/payment.entity';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface PaymentRepository {
  /** Inserts the payment and its method details (e.g. the Pix charge). */
  save(payment: Payment): Promise<void>;
  /** Persists a status transition and the method details it changed. */
  update(payment: Payment): Promise<void>;

  /** Scoped by merchant: another merchant's payment is reported as missing. */
  findById(merchantId: string, id: string): Promise<Payment | null>;
  listByMerchant(merchantId: string, limit: number): Promise<Payment[]>;
  findByTxid(txid: string): Promise<Payment | null>;
  /** Card payments still pending: the process died before the acquirer answered. */
  findStuckCardPayments(createdBefore: Date, limit: number): Promise<Payment[]>;

  // The lock* methods hold row locks until the surrounding unit of work ends.
  lockById(merchantId: string, id: string): Promise<Payment | null>;
  lockByTxid(txid: string): Promise<Payment | null>;
  /** Pending or authorized payments past expiry, skipping rows another worker holds. */
  lockExpiredOpen(now: Date, limit: number): Promise<Payment[]>;
}
