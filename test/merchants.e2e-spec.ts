import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OpenAccountsUseCase } from '../src/ledger/application/use-cases/open-accounts.usecase';
import { createTestApp, PLATFORM } from './helpers/app';

type ApiKeyBody = {
  id: string;
  type: 'secret' | 'publishable';
  key: string;
  revokedAt: string | null;
};
type OnboardedBody = { id: string; name: string; apiKeys: ApiKeyBody[] };
type BalanceBody = {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
};
type ErrorBody = { error: string };

let keySequence = 0;
const nextKey = () => `merchants-key-${++keySequence}`;

describe('Merchants (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());

  const onboardRaw = (name: string, key = nextKey()) =>
    http()
      .post('/platform/merchants')
      .set('Authorization', PLATFORM)
      .set('Idempotency-Key', key)
      .send({ name });

  async function onboard(name = 'Loja Prateleira') {
    const res = await onboardRaw(name).expect(201);
    const body = res.body as OnboardedBody;
    const keyOf = (type: string) => body.apiKeys.find((k) => k.type === type)!;
    return {
      id: body.id,
      secret: keyOf('secret').key,
      secretId: keyOf('secret').id,
      publishable: keyOf('publishable').key,
    };
  }

  const asMerchant = (key: string) => ({
    get: (path: string) =>
      http().get(path).set('Authorization', `Bearer ${key}`),
    post: (path: string, body: object, idempotencyKey = nextKey()) =>
      http()
        .post(path)
        .set('Authorization', `Bearer ${key}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body),
    delete: (path: string) =>
      http()
        .delete(path)
        .set('Authorization', `Bearer ${key}`)
        .set('Idempotency-Key', nextKey()),
  });

  describe('POST /platform/merchants', () => {
    it('requires the platform token', async () => {
      await http()
        .post('/platform/merchants')
        .set('Idempotency-Key', nextKey())
        .send({ name: 'x' })
        .expect(401);
    });

    it('rejects an empty name', async () => {
      await onboardRaw('').expect(400);
    });

    it('creates the merchant with a secret and a publishable key', async () => {
      const res = await onboardRaw('Loja Prateleira').expect(201);
      const body = res.body as OnboardedBody;

      expect(body.id).toMatch(/^mch_[0-9a-f]{24}$/);
      expect(body.name).toBe('Loja Prateleira');
      expect(body.apiKeys.map((k) => [k.type, k.key.slice(0, 8)])).toEqual([
        ['secret', 'sk_test_'],
        ['publishable', 'pk_test_'],
      ]);
      expect(body.apiKeys.every((k) => k.key.length === 40)).toBe(true);
    });

    it('never stores the plaintext keys, not even for idempotent replays', async () => {
      const key = nextKey();
      const first = (await onboardRaw('Replay', key).expect(201))
        .body as OnboardedBody;

      const replay = await onboardRaw('Replay', key).expect(201);

      expect(replay.headers['idempotent-replayed']).toBe('true');
      const replayed = replay.body as OnboardedBody;
      expect(replayed.id).toBe(first.id);
      expect(replayed.apiKeys.map((k) => k.key)).toEqual(
        first.apiKeys.map((k) => `${k.key.slice(0, 8)}…${k.key.slice(-4)}`),
      );

      const dump = JSON.stringify([
        await dataSource.query(`SELECT * FROM idempotency_keys`),
        await dataSource.query(`SELECT * FROM api_keys`),
      ]);
      for (const { key: plaintext } of first.apiKeys) {
        expect(dump).not.toContain(plaintext);
      }
    });

    it('creates nothing when opening the ledger accounts fails', async () => {
      const count = async () => {
        const [row]: { count: string }[] = await dataSource.query(
          `SELECT count(*) FROM merchants`,
        );
        return Number(row.count);
      };
      const before = await count();
      jest
        .spyOn(app.get(OpenAccountsUseCase), 'execute')
        .mockRejectedValueOnce(new Error('ledger unavailable'));

      await onboardRaw('Atomic').expect(500);

      expect(await count()).toBe(before);
    });
  });

  describe('GET /platform/merchants/:id', () => {
    it('returns the merchant, or 404', async () => {
      const merchant = await onboard();

      await http()
        .get(`/platform/merchants/${merchant.id}`)
        .set('Authorization', PLATFORM)
        .expect(200);
      const res = await http()
        .get('/platform/merchants/mch_missing')
        .set('Authorization', PLATFORM)
        .expect(404);
      expect((res.body as ErrorBody).error).toBe('merchants.not_found');
    });
  });

  describe('API key authentication', () => {
    it('accepts the secret key', async () => {
      const merchant = await onboard('Auth');

      const res = await asMerchant(merchant.secret)
        .get('/v1/account')
        .expect(200);

      expect(res.body).toMatchObject({ id: merchant.id, name: 'Auth' });
    });

    it('rejects a missing or unknown key with 401', async () => {
      await http().get('/v1/account').expect(401);
      await asMerchant('sk_test_unknown').get('/v1/account').expect(401);
    });

    it('rejects the publishable key on secret-only endpoints with 403', async () => {
      const merchant = await onboard();

      await asMerchant(merchant.publishable).get('/v1/account').expect(403);
    });

    it('does not accept the platform token as a merchant key', async () => {
      await http()
        .get('/v1/account')
        .set('Authorization', PLATFORM)
        .expect(401);
    });
  });

  describe('GET /v1/balance', () => {
    it('starts at zero', async () => {
      const merchant = await onboard();

      const res = await asMerchant(merchant.secret)
        .get('/v1/balance')
        .expect(200);

      expect(res.body).toEqual({
        available: [{ amount: 0, currency: 'BRL' }],
        pending: [{ amount: 0, currency: 'BRL' }],
      });
    });

    it('is derived from the ledger, as what the PSP owes the merchant', async () => {
      const merchant = await onboard();
      // an operator's manual credit: it lands in available (pending is scheduled)
      await http()
        .post('/ledger/transactions')
        .set('Authorization', PLATFORM)
        .set('Idempotency-Key', nextKey())
        .send({
          description: 'Goodwill credit',
          source: 'manual',
          externalReference: `goodwill-${merchant.id}`,
          entries: [
            { accountId: 'rail-costs', amount: 9901, currency: 'BRL' },
            {
              accountId: `merchant:${merchant.id}:available`,
              amount: -9901,
              currency: 'BRL',
            },
          ],
        })
        .expect(201);

      const res = await asMerchant(merchant.secret)
        .get('/v1/balance')
        .expect(200);

      const balance = res.body as BalanceBody;
      expect(balance.available).toEqual([{ amount: 9901, currency: 'BRL' }]);
      expect(balance.pending).toEqual([{ amount: 0, currency: 'BRL' }]);
    });
  });

  describe('/v1/api_keys', () => {
    it('rolls the secret key: create a new one, revoke the old one', async () => {
      const merchant = await onboard();
      const me = asMerchant(merchant.secret);

      const created = (
        await me.post('/v1/api_keys', { type: 'secret' }).expect(201)
      ).body as ApiKeyBody;
      expect(created.key).toMatch(/^sk_test_/);
      await asMerchant(created.key).get('/v1/account').expect(200);

      const revoked = (
        await asMerchant(created.key)
          .delete(`/v1/api_keys/${merchant.secretId}`)
          .expect(200)
      ).body as ApiKeyBody;

      expect(revoked.revokedAt).not.toBeNull();
      await me.get('/v1/account').expect(401);
      await asMerchant(created.key).get('/v1/account').expect(200);
    });

    it('lists keys masked', async () => {
      const merchant = await onboard();

      const res = await asMerchant(merchant.secret)
        .get('/v1/api_keys')
        .expect(200);

      // both keys share the onboarding timestamp, so their order is arbitrary
      const keys = (res.body as ApiKeyBody[]).map((k) => k.key).sort();
      expect(keys).toEqual(
        [
          `${merchant.secret.slice(0, 8)}…${merchant.secret.slice(-4)}`,
          `${merchant.publishable.slice(0, 8)}…${merchant.publishable.slice(-4)}`,
        ].sort(),
      );
    });

    it('refuses to revoke the last secret key', async () => {
      const merchant = await onboard();

      const res = await asMerchant(merchant.secret)
        .delete(`/v1/api_keys/${merchant.secretId}`)
        .expect(422);

      expect((res.body as ErrorBody).error).toBe('merchants.last_secret_key');
      await asMerchant(merchant.secret).get('/v1/account').expect(200);
    });

    it("cannot touch another merchant's keys", async () => {
      const alice = await onboard('Alice');
      const bob = await onboard('Bob');
      await asMerchant(alice.secret)
        .post('/v1/api_keys', { type: 'secret' })
        .expect(201);

      await asMerchant(bob.secret)
        .delete(`/v1/api_keys/${alice.secretId}`)
        .expect(404);
      await asMerchant(alice.secret).get('/v1/account').expect(200);
    });

    it('scopes Idempotency-Keys per merchant', async () => {
      const alice = await onboard('Alice');
      const bob = await onboard('Bob');
      const shared = nextKey();

      const a = await asMerchant(alice.secret)
        .post('/v1/api_keys', { type: 'publishable' }, shared)
        .expect(201);
      const b = await asMerchant(bob.secret)
        .post('/v1/api_keys', { type: 'publishable' }, shared)
        .expect(201);

      expect(b.headers['idempotent-replayed']).toBeUndefined();
      expect((a.body as ApiKeyBody).id).not.toBe((b.body as ApiKeyBody).id);
    });

    it('rejects an unknown key type', async () => {
      const merchant = await onboard();

      await asMerchant(merchant.secret)
        .post('/v1/api_keys', { type: 'admin' })
        .expect(400);
    });
  });
});
