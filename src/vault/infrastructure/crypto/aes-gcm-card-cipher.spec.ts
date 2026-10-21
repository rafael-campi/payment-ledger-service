import { randomBytes } from 'crypto';
import { AesGcmCardCipher } from './aes-gcm-card-cipher';

describe('AesGcmCardCipher', () => {
  const cipher = new AesGcmCardCipher(randomBytes(32));
  const pan = '4242424242424242';

  it('round-trips and never stores the number in clear', () => {
    const encrypted = cipher.encrypt(pan, 'tok_1');

    expect(encrypted.toString('latin1')).not.toContain(pan);
    expect(cipher.decrypt(encrypted, 'tok_1')).toBe(pan);
  });

  it('encrypts the same number differently every time', () => {
    expect(
      cipher.encrypt(pan, 'tok_1').equals(cipher.encrypt(pan, 'tok_1')),
    ).toBe(false);
  });

  it('refuses a ciphertext moved to another token', () => {
    expect(() =>
      cipher.decrypt(cipher.encrypt(pan, 'tok_1'), 'tok_2'),
    ).toThrow();
  });

  it('refuses a tampered ciphertext', () => {
    const encrypted = cipher.encrypt(pan, 'tok_1');
    encrypted[encrypted.length - 1] ^= 1;

    expect(() => cipher.decrypt(encrypted, 'tok_1')).toThrow();
  });

  it('refuses another key', () => {
    const other = new AesGcmCardCipher(randomBytes(32));

    expect(() =>
      other.decrypt(cipher.encrypt(pan, 'tok_1'), 'tok_1'),
    ).toThrow();
  });

  it('requires a 256-bit key', () => {
    expect(() => new AesGcmCardCipher(randomBytes(16))).toThrow(/32 bytes/);
  });
});
