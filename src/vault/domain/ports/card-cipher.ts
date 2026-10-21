export const CARD_CIPHER = Symbol('CARD_CIPHER');

/**
 * Encrypts card numbers at rest. `context` (the token id) is bound to the
 * ciphertext, so an encrypted number copied to another row does not decrypt.
 */
export interface CardCipher {
  encrypt(pan: string, context: string): Buffer;
  decrypt(encrypted: Buffer, context: string): string;
}
