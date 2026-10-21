import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TestCards } from '../src/rails/simulated-acquirer';
import { AuthorizeWithCardUseCase } from '../src/vault/application/use-cases/authorize-with-card.usecase';
import { RecoverCardPaymentsUseCase } from '../src/payments/application/use-cases/recover-card-payments.usecase';
import { ExpirePaymentsUseCase } from '../src/payments/application/use-cases/expire-payments.usecase';
import { createTestApp, PLATFORM } from './helpers/app';

type TokenBody = {
  id: string;
  card: { brand: string; last4: string; expMonth: number; expYear: number };
};
type PaymentBody = {
  id: string;
  status: string;
  amount: number;
  fee: number;
  net: number;
  card: { brand: string; last4: string; authorizationId: string | null } | null;
  failure: { code: string; message: string } | null;
};
type ErrorBody = { error: string };

let keySequence = 0;
const nextKey = () => `cards-key-${++keySequence}`;

describe('Cards (e2e)', () => {
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

  async function merchant() {
    const res = await http()
      .post('/platform/merchants')
      .set('Authorization', PLATFORM)
      .set('Idempotency-Key', nextKey())
      .send({ name: 'Loja Prateleira' })
      .expect(201);
    const body = res.body as {
      id: string;
      apiKeys: { type: string; key: string }[];
    };
    const key = (type: string) =>
      body.apiKeys.find((k) => k.type === type)!.key;
    const sk = `Bearer ${key('secret')}`;
    const pk = `Bearer ${key('publishable')}`;

    const m = {
      id: body.id,
      pk,
      tokenize: (card: object, auth = pk) =>
        http()
          .post('/v1/tokens')
          .set('Authorization', auth)
          .send({ card: { expMonth: 12, expYear: 2030, cvc: '123', ...card } }),
      token: async (number: string = TestCards.APPROVED_VISA) =>
        ((await m.tokenize({ number }).expect(201)).body as TokenBody).id,
      post: (path: string, body: object = {}, key = nextKey()) =>
        http()
          .post(path)
          .set('Authorization', sk)
          .set('Idempotency-Key', key)
          .send(body),
      get: (path: string) => http().get(path).set('Authorization', sk),
      pay: (token: string, extra: object = {}) =>
        m.post('/v1/payments', {
          amount: 10000,
          currency: 'BRL',
          method: 'credit_card',
          card: { token },
          ...extra,
        }),
      balance: async () =>
        (
          (await m.get('/v1/balance').expect(200)).body as {
            pending: { amount: number }[];
          }
        ).pending[0].amount,
      eventTypes: async () =>
        (
          (await m.get('/v1/events').expect(200)).body as { type: string }[]
        ).map((e) => e.type),
    };
    return m;
  }

  const ledgerBalance = async (accountId: string) => {
    const [row]: { balance: string }[] = await dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = $1`,
      [accountId],
    );
    return Number(row.balance);
  };

  const vaultRow = async (tokenId: string) => {
    const [row]: { pan_encrypted: Buffer | null; purged_at: Date | null }[] =
      await dataSource.query(
        `SELECT pan_encrypted, purged_at FROM vault_cards WHERE id = $1`,
        [tokenId],
      );
    return row;
  };

  describe('POST /v1/tokens', () => {
    it('tokenizes with the publishable key and returns no card number', async () => {
      const m = await merchant();

      const res = await m
        .tokenize({ number: '4242 4242 4242 4242' })
        .expect(201);

      const token = res.body as TokenBody;
      expect(token.id).toMatch(/^tok_[0-9a-f]{24}$/);
      expect(token.card).toEqual({
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
      });
      expect(JSON.stringify(res.body)).not.toContain('4242424242424242');
    });

    it('stores the number only encrypted', async () => {
      const m = await merchant();
      const tokenId = await m.token();

      const row = await vaultRow(tokenId);

      expect(row.pan_encrypted).toBeInstanceOf(Buffer);
      expect(row.pan_encrypted!.toString('latin1')).not.toContain(
        TestCards.APPROVED_VISA,
      );
      const dump = JSON.stringify(
        await dataSource.query(`SELECT * FROM vault_cards`),
      );
      expect(dump).not.toContain(TestCards.APPROVED_VISA);
    });

    it.each([
      [
        'a bad check digit',
        { number: '4242424242424241' },
        422,
        'vault.invalid_number',
      ],
      [
        'an expired card',
        { number: TestCards.APPROVED_VISA, expYear: 2020 },
        422,
        'vault.expired_card',
      ],
      [
        'a wrong-length CVC',
        { number: TestCards.APPROVED_VISA, cvc: '12' },
        400,
        undefined,
      ],
      ['letters in the number', { number: '4242abcd42424242' }, 400, undefined],
    ])(
      'rejects %s without echoing the number',
      async (_, card, status, code) => {
        const m = await merchant();

        const res = await m.tokenize(card).expect(status);

        if (code) expect((res.body as ErrorBody).error).toBe(code);
        expect(JSON.stringify(res.body)).not.toContain(
          (card as { number: string }).number,
        );
      },
    );

    it('requires an API key', async () => {
      await http().post('/v1/tokens').send({}).expect(401);
    });

    it('does not let the publishable key do anything else', async () => {
      const m = await merchant();
      const token = await m.token();

      await http()
        .post('/v1/payments')
        .set('Authorization', m.pk)
        .set('Idempotency-Key', nextKey())
        .send({
          amount: 100,
          currency: 'BRL',
          method: 'credit_card',
          card: { token },
        })
        .expect(403);
    });
  });

  describe('paying with a card', () => {
    it('authorizes and captures, settles in the ledger and wipes the number', async () => {
      const m = await merchant();
      const receivableBefore = await ledgerBalance('acquirer-receivable');
      const tokenId = await m.token(TestCards.APPROVED_MASTERCARD);

      const res = await m.pay(tokenId).expect(201);

      const payment = res.body as PaymentBody;
      expect(payment).toMatchObject({
        status: 'succeeded',
        amount: 10000,
        fee: 299,
        net: 9701,
        card: { brand: 'mastercard', last4: '4444' },
        failure: null,
      });
      expect(payment.card!.authorizationId).toMatch(/^auth_/);
      expect(await ledgerBalance('acquirer-receivable')).toBe(
        receivableBefore + 10000,
      );
      expect(await m.balance()).toBe(9701);
      const row = await vaultRow(tokenId);
      expect(row.pan_encrypted).toBeNull();
      expect(row.purged_at).toBeInstanceOf(Date);
      expect(await m.eventTypes()).toEqual(['payment.succeeded']);
    });

    it.each([
      [TestCards.DECLINED, 'card_declined'],
      [TestCards.INSUFFICIENT_FUNDS, 'insufficient_funds'],
    ])(
      'records a decline of %s as %s, moving no money',
      async (number, code) => {
        const m = await merchant();
        const tokenId = await m.token(number);

        const res = await m.pay(tokenId).expect(201);

        const payment = res.body as PaymentBody;
        expect(payment.status).toBe('failed');
        expect(payment.failure?.code).toBe(code);
        expect(payment.failure?.message).toBeTruthy();
        expect(await m.balance()).toBe(0);
        expect((await vaultRow(tokenId)).pan_encrypted).toBeNull();
        expect(await m.eventTypes()).toEqual(['payment.failed']);
      },
    );

    it('uses a token only once', async () => {
      const m = await merchant();
      const tokenId = await m.token();
      await m.pay(tokenId).expect(201);

      const res = await m.pay(tokenId).expect(409);

      expect((res.body as ErrorBody).error).toBe('vault.token_used');
    });

    it('replays a retried request instead of charging again', async () => {
      const m = await merchant();
      const tokenId = await m.token();
      const key = nextKey();
      const body = {
        amount: 10000,
        currency: 'BRL',
        method: 'credit_card',
        card: { token: tokenId },
      };

      const first = await m.post('/v1/payments', body, key).expect(201);
      const retry = await m.post('/v1/payments', body, key).expect(201);

      expect(retry.body).toEqual(first.body);
      expect(await m.balance()).toBe(9701);
    });

    it("rejects another merchant's token", async () => {
      const alice = await merchant();
      const bob = await merchant();
      const tokenId = await alice.token();

      await bob.pay(tokenId).expect(404);
    });

    it('rejects an expired token', async () => {
      const m = await merchant();
      const tokenId = await m.token();
      await dataSource.query(
        `UPDATE vault_cards SET expires_at = now() - interval '1 second' WHERE id = $1`,
        [tokenId],
      );

      const res = await m.pay(tokenId).expect(422);

      expect((res.body as ErrorBody).error).toBe('vault.token_expired');
    });

    it.each([
      ['a card payment without a token', { method: 'credit_card' }],
      [
        'a Pix payment with a card',
        { method: 'pix', card: { token: `tok_${'0'.repeat(24)}` } },
      ],
    ])('rejects %s', async (_, override) => {
      const m = await merchant();

      const res = await m
        .post('/v1/payments', { amount: 100, currency: 'BRL', ...override })
        .expect(422);

      expect((res.body as ErrorBody).error).toBe('payments.card_mismatch');
    });
  });

  describe('authorize now, capture later', () => {
    it('holds the money without moving it, then captures', async () => {
      const m = await merchant();
      const tokenId = await m.token();

      const authorized = (await m.pay(tokenId, { capture: false }).expect(201))
        .body as PaymentBody;
      expect(authorized.status).toBe('authorized');
      expect(await m.balance()).toBe(0);

      const first = await m
        .post(`/v1/payments/${authorized.id}/capture`)
        .expect(200);
      const again = await m
        .post(`/v1/payments/${authorized.id}/capture`)
        .expect(200);

      expect((first.body as PaymentBody).status).toBe('succeeded');
      expect((again.body as PaymentBody).status).toBe('succeeded');
      expect(await m.balance()).toBe(9701);
      expect(await m.eventTypes()).toEqual([
        'payment.succeeded',
        'payment.authorized',
      ]);
    });

    it('voids an authorization when it is canceled', async () => {
      const m = await merchant();
      const authorized = (
        await m.pay(await m.token(), { capture: false }).expect(201)
      ).body as PaymentBody;

      const res = await m
        .post(`/v1/payments/${authorized.id}/cancel`)
        .expect(200);

      expect((res.body as PaymentBody).status).toBe('canceled');
      await m.post(`/v1/payments/${authorized.id}/capture`).expect(422);
      expect(await m.balance()).toBe(0);
    });

    it('lets an uncaptured authorization lapse after 7 days', async () => {
      const m = await merchant();
      const authorized = (
        await m.pay(await m.token(), { capture: false }).expect(201)
      ).body as PaymentBody;

      await app
        .get(ExpirePaymentsUseCase)
        .execute(new Date(Date.now() + 7 * 24 * 3600_000 + 1000));

      const after = (await m.get(`/v1/payments/${authorized.id}`).expect(200))
        .body as PaymentBody;
      expect(after.status).toBe('expired');
    });

    it('refuses to capture a Pix payment', async () => {
      const m = await merchant();
      const pix = (
        await m
          .post('/v1/payments', { amount: 100, currency: 'BRL', method: 'pix' })
          .expect(201)
      ).body as PaymentBody;

      const res = await m.post(`/v1/payments/${pix.id}/capture`).expect(422);

      expect((res.body as ErrorBody).error).toBe('payments.not_capturable');
    });
  });

  describe('when the acquirer does not answer', () => {
    it('leaves the payment pending and finishes it later, charging once', async () => {
      const m = await merchant();
      const tokenId = await m.token();
      jest
        .spyOn(app.get(AuthorizeWithCardUseCase), 'execute')
        .mockRejectedValueOnce(new Error('socket hang up'));

      const pending = (await m.pay(tokenId).expect(201)).body as PaymentBody;
      expect(pending.status).toBe('pending');
      expect(await m.balance()).toBe(0);

      await app
        .get(RecoverCardPaymentsUseCase)
        .execute(new Date(Date.now() + 61_000));
      await app
        .get(RecoverCardPaymentsUseCase)
        .execute(new Date(Date.now() + 122_000));

      const after = (await m.get(`/v1/payments/${pending.id}`).expect(200))
        .body as PaymentBody;
      expect(after.status).toBe('succeeded');
      expect(await m.balance()).toBe(9701);
    });
  });
});
