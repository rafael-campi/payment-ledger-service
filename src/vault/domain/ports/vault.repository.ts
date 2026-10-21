import { VaultedCard } from '../entities/vaulted-card.entity';

export const VAULT_REPOSITORY = Symbol('VAULT_REPOSITORY');

export interface VaultRepository {
  save(card: VaultedCard, panEncrypted: Buffer): Promise<void>;
  findById(merchantId: string, id: string): Promise<VaultedCard | null>;
  /** Scoped by merchant; locks the row until the surrounding unit of work ends. */
  lockById(merchantId: string, id: string): Promise<VaultedCard | null>;
  /** The encrypted number, or null once purged. */
  findEncryptedPan(id: string): Promise<Buffer | null>;
  markRedeemed(id: string, paymentId: string, at: Date): Promise<void>;
  /** Erases the encrypted number; the card's metadata stays for the record. */
  purge(id: string, at: Date): Promise<void>;
  /** Purges tokens that expired without being used; returns how many. */
  purgeExpiredUnused(now: Date): Promise<number>;
}
