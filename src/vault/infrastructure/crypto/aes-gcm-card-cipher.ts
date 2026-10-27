import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { CardCipher } from '../../domain/ports/card-cipher';

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM with the key from VAULT_ENCRYPTION_KEY (32 bytes, base64).
 * Stored as iv | auth tag | ciphertext. A production vault would keep the
 * key in a KMS/HSM and rotate it; here it comes from the environment.
 */
export class AesGcmCardCipher implements CardCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('VAULT_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
    }
  }

  static fromEnv(): AesGcmCardCipher {
    const encoded = process.env.VAULT_ENCRYPTION_KEY;
    if (!encoded) {
      throw new Error(
        'VAULT_ENCRYPTION_KEY is not set (generate one: openssl rand -base64 32).',
      );
    }
    return new AesGcmCardCipher(Buffer.from(encoded, 'base64'));
  }

  encrypt(pan: string, context: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(pan, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(encrypted: Buffer, context: string): string {
    const iv = encrypted.subarray(0, IV_BYTES);
    const tag = encrypted.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }
}
