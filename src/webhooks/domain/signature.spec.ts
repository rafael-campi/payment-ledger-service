import { signPayload, verifySignature } from './signature';

describe('webhook signature', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1","type":"payment.succeeded"}';
  const now = 1_790_000_000_000;
  const t = now / 1000;

  it('verifies what it signs', () => {
    expect(
      verifySignature(signPayload(secret, body, t), body, secret, { now }),
    ).toBe(true);
  });

  it.each([
    ['a tampered body', signPayload(secret, body, t), `${body} `, secret],
    ['another secret', signPayload('whsec_other', body, t), body, secret],
    [
      'a replay older than 5 minutes',
      signPayload(secret, body, t - 301),
      body,
      secret,
    ],
    ['a missing header', undefined, body, secret],
    ['a malformed header', 'garbage', body, secret],
    ['a non-hex signature', `t=${t},v1=zz`, body, secret],
  ])('rejects %s', (_, header, payload, key) => {
    expect(verifySignature(header, payload, key, { now })).toBe(false);
  });

  it('accepts any of several v1 signatures (secret rotation)', () => {
    const valid = signPayload(secret, body, t).split(',')[1];
    const header = `t=${t},v1=${'0'.repeat(64)},${valid}`;

    expect(verifySignature(header, body, secret, { now })).toBe(true);
  });
});
