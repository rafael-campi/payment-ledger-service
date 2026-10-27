import { ApiKey, ApiKeyType, hashApiKey } from './api-key.entity';

describe('ApiKey', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  it.each([
    [ApiKeyType.SECRET, /^sk_test_[A-Za-z0-9_-]{32}$/],
    [ApiKeyType.PUBLISHABLE, /^pk_test_[A-Za-z0-9_-]{32}$/],
  ])('issues a %s key that is stored only as a hash', (type, format) => {
    const { apiKey, plaintext } = ApiKey.issue('mch_1', type, now);

    expect(plaintext).toMatch(format);
    expect(apiKey.keyHash).toBe(hashApiKey(plaintext));
    expect(JSON.stringify(apiKey)).not.toContain(plaintext);
    expect(apiKey.masked).toBe(
      `${plaintext.slice(0, 8)}…${plaintext.slice(-4)}`,
    );
  });

  it('issues a different key every time', () => {
    const a = ApiKey.issue('mch_1', ApiKeyType.SECRET, now);
    const b = ApiKey.issue('mch_1', ApiKeyType.SECRET, now);

    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.apiKey.id).not.toBe(b.apiKey.id);
  });

  it('revokes without mutating, keeping the first revocation time', () => {
    const { apiKey } = ApiKey.issue('mch_1', ApiKeyType.SECRET, now);
    const later = new Date('2026-10-22T12:00:00Z');

    const revoked = apiKey.revoke(later);

    expect(apiKey.isActive).toBe(true);
    expect(revoked.isActive).toBe(false);
    expect(revoked.revoke(new Date()).revokedAt).toEqual(later);
  });
});
