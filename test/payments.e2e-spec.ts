import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ReceivePixUseCase } from '../src/payments/application/use-cases/receive-pix.usecase';
import { ExpirePaymentsUseCase } from '../src/payments/application/use-cases/expire-payments.usecase';
import { DispatchWebhooksUseCase } from '../src/webhooks/application/use-cases/dispatch-webhooks.usecase';
import { crc16 } from '../src/payments/domain/pix/br-code';
import { verifySignature } from '../src/webhooks/domain/signature';
import { createTestApp, PLATFORM } from './helpers/app';
import { WebhookReceiver } from './helpers/webhook-receiver';

type PaymentBody = {
  id: string;
  amount: number;
  status: string;
  fee: number;
  net: number;
  metadata: Record<string, string>;
  pix: {
    txid: string;
    copiaECola: string;
    endToEndId: string | null;
  };
  expiresAt: string;
};
type EventBody = {
  id: string;
  type: string;
  data: { object: PaymentBody };
};
type ErrorBody = { error: string };
type BalanceBody = { pending: { amount: number }[] };

let keySequence = 0;
const nextKey = () => `payments-key-${++keySequence}`;

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const receiver = new WebhookReceiver();

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await receiver.start();
  });

  afterAll(async () => {
    await app.close();
    await receiver.stop();
  });

  const http = () => request(app.getHttpServer());

  /** A merchant whose webhooks go to `receiver.url(hookPath)`. */
  async function merchant(
    hookPath?: string,
    options: { pixFeeBps?: number } = {},
  ) {
    const onboarded = await http()
      .post('/platform/merchants')
      .set('Authorization', PLATFORM)
      .set('Idempotency-Key', nextKey())
      .send({ name: 'Loja Prateleira', ...options })
      .expect(201);
    const body = onboarded.body as {
      id: string;
      apiKeys: { type: string; key: string }[];
    };
    const secretKey = body.apiKeys.find((k) => k.type === 'secret')!.key;
    const auth = `Bearer ${secretKey}`;

    let webhookSecret = '';
    if (hookPath) {
      const endpoint = await http()
        .post('/v1/webhook_endpoints')
        .set('Authorization', auth)
        .set('Idempotency-Key', nextKey())
        .send({ url: receiver.url(hookPath) })
        .expect(201);
      webhookSecret = (endpoint.body as { secret: string }).secret;
    }

    return {
      id: body.id,
      webhookSecret,
      get: (path: string) => http().get(path).set('Authorization', auth),
      delete: (path: string) =>
        http()
          .delete(path)
          .set('Authorization', auth)
          .set('Idempotency-Key', nextKey()),
      post: (path: string, body: object = {}, key = nextKey()) =>
        http()
          .post(path)
          .set('Authorization', auth)
          .set('Idempotency-Key', key)
          .send(body),
      createPix: async (overrides: object = {}) =>
        (
          await http()
            .post('/v1/payments')
            .set('Authorization', auth)
            .set('Idempotency-Key', nextKey())
            .send({
              amount: 10000,
              currency: 'BRL',
              method: 'pix',
              ...overrides,
            })
            .expect(201)
        ).body as PaymentBody,
    };
  }

  const payPix = (txid: string, body: object = {}) =>
    http().post(`/simulator/pix/${txid}/pay`).send(body);

  const ledgerBalance = async (accountId: string) => {
    const [row]: { balance: string }[] = await dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = $1`,
      [accountId],
    );
    return Number(row.balance);
  };

  const pendingBalance = async (m: Awaited<ReturnType<typeof merchant>>) =>
    ((await m.get('/v1/balance').expect(200)).body as BalanceBody).pending[0]
      .amount;

  const dispatch = (at = new Date()) =>
    app.get(DispatchWebhooksUseCase).execute(at);

  describe('POST /v1/payments', () => {
    it('creates a pending Pix charge with a valid BR Code', async () => {
      const m = await merchant();

      const payment = await m.createPix({
        description: 'Pedido 42',
        metadata: { cartId: '42' },
      });

      expect(payment).toMatchObject({
        status: 'pending',
        amount: 10000,
        fee: 99,
        net: 9901,
        metadata: { cartId: '42' },
        pix: { endToEndId: null },
      });
      expect(payment.id).toMatch(/^pay_/);
      expect(payment.pix.txid).toMatch(/^[a-zA-Z0-9]{32}$/);
      const { copiaECola } = payment.pix;
      expect(copiaECola).toMatch(/^000201/);
      expect(copiaECola.slice(-4)).toBe(crc16(copiaECola.slice(0, -4)));
      const ttl = Date.parse(payment.expiresAt) - Date.now();
      expect(ttl).toBeGreaterThan(3590_000);
      expect(ttl).toBeLessThanOrEqual(3600_000);
    });

    it('moves no money until the Pix arrives', async () => {
      const before = await ledgerBalance('pix-settlement');
      await (await merchant()).createPix();

      expect(await ledgerBalance('pix-settlement')).toBe(before);
    });

    it('replays a retried request instead of creating a second charge', async () => {
      const m = await merchant();
      const key = nextKey();
      const body = { amount: 500, currency: 'BRL', method: 'pix' };

      const first = await m.post('/v1/payments', body, key).expect(201);
      const retry = await m.post('/v1/payments', body, key).expect(201);

      expect((retry.body as PaymentBody).id).toBe(
        (first.body as PaymentBody).id,
      );
      expect(await m.get('/v1/payments').expect(200)).toHaveProperty(
        'body.length',
        1,
      );
    });

    it.each([
      [{ currency: 'USD' }, 'payments.unsupported_currency'],
      [{ metadata: { cartId: 42 } }, 'payments.invalid_metadata'],
    ])('rejects %j with 422', async (override, code) => {
      const m = await merchant();

      const res = await m
        .post('/v1/payments', {
          amount: 10000,
          currency: 'BRL',
          method: 'pix',
          ...override,
        })
        .expect(422);

      expect((res.body as ErrorBody).error).toBe(code);
    });

    it.each([
      [{ amount: 0 }],
      [{ amount: 10.5 }],
      [{ method: 'boleto' }],
      [{ expiresInSeconds: 10 }],
    ])('rejects %j with 400', async (override) => {
      const m = await merchant();

      await m
        .post('/v1/payments', {
          amount: 10000,
          currency: 'BRL',
          method: 'pix',
          ...override,
        })
        .expect(400);
    });
  });

  describe('paying a Pix charge', () => {
    it('settles in the ledger, succeeds the payment and notifies the merchant, all signed', async () => {
      const m = await merchant('/full-flow');
      const settlementBefore = await ledgerBalance('pix-settlement');
      const feesBefore = await ledgerBalance('fee-revenue');
      const payment = await m.createPix();

      const paid = await payPix(payment.pix.txid).expect(200);

      expect(paid.body).toMatchObject({ outcome: 'succeeded' });
      const after = (await m.get(`/v1/payments/${payment.id}`).expect(200))
        .body as PaymentBody;
      expect(after.status).toBe('succeeded');
      expect(after.pix.endToEndId).toBe(
        (paid.body as { endToEndId: string }).endToEndId,
      );
      expect(await ledgerBalance('pix-settlement')).toBe(
        settlementBefore + 10000,
      );
      expect(await ledgerBalance('fee-revenue')).toBe(feesBefore - 99);
      expect(await pendingBalance(m)).toBe(9901);

      await dispatch();

      const deliveries = receiver.deliveriesTo('/full-flow');
      const events = deliveries.map((d) => JSON.parse(d.body) as EventBody);
      expect(events.map((e) => e.type)).toEqual(
        expect.arrayContaining(['payment.pending', 'payment.succeeded']),
      );
      const succeeded = events.find((e) => e.type === 'payment.succeeded')!;
      expect(succeeded.data.object).toEqual(after);
      for (const d of deliveries) {
        expect(
          verifySignature(
            d.headers['psp-signature'] as string,
            d.body,
            m.webhookSecret,
          ),
        ).toBe(true);
      }
    });

    it('ignores a repeated notice of the same Pix', async () => {
      const m = await merchant();
      const payment = await m.createPix();
      const { endToEndId } = (await payPix(payment.pix.txid).expect(200))
        .body as { endToEndId: string };

      const again = await app.get(ReceivePixUseCase).execute({
        txid: payment.pix.txid,
        endToEndId,
        amount: 10000,
        paidAt: new Date(),
      });

      expect(again.outcome).toBe('duplicate');
      expect(await pendingBalance(m)).toBe(9901);
    });

    it('cannot be paid twice', async () => {
      const m = await merchant();
      const payment = await m.createPix();
      await payPix(payment.pix.txid).expect(200);

      const res = await payPix(payment.pix.txid).expect(422);

      expect((res.body as ErrorBody).error).toBe(
        'simulator.charge_not_payable',
      );
    });

    it('holds a Pix with the wrong amount in suspense, away from the merchant', async () => {
      const m = await merchant();
      const payment = await m.createPix();
      const suspenseBefore = await ledgerBalance('suspense');

      const res = await payPix(payment.pix.txid, { amount: 9000 }).expect(200);

      expect(res.body).toMatchObject({ outcome: 'unmatched' });
      expect(await ledgerBalance('suspense')).toBe(suspenseBefore - 9000);
      expect(await pendingBalance(m)).toBe(0);
      const after = (await m.get(`/v1/payments/${payment.id}`).expect(200))
        .body as PaymentBody;
      expect(after.status).toBe('pending');
    });

    it('holds a Pix that arrives after expiry in suspense', async () => {
      const m = await merchant();
      const payment = await m.createPix({ expiresInSeconds: 60 });

      const result = await app.get(ReceivePixUseCase).execute({
        txid: payment.pix.txid,
        endToEndId: `E99999999202610211200late${keySequence}`.slice(0, 32),
        amount: 10000,
        paidAt: new Date(Date.now() + 61_000),
      });

      expect(result.outcome).toBe('unmatched');
      expect(await pendingBalance(m)).toBe(0);
    });

    it('lets only one of two simultaneous Pix pay the charge', async () => {
      const m = await merchant();
      const payment = await m.createPix();
      const suspenseBefore = await ledgerBalance('suspense');
      const receive = (suffix: string) =>
        app.get(ReceivePixUseCase).execute({
          txid: payment.pix.txid,
          endToEndId: `E99999999202610211200race${suffix}`,
          amount: 10000,
          paidAt: new Date(),
        });

      const outcomes = await Promise.all([
        receive('0001AAA'),
        receive('0002BBB'),
      ]);

      expect(outcomes.map((o) => o.outcome).sort()).toEqual([
        'succeeded',
        'unmatched',
      ]);
      expect(await pendingBalance(m)).toBe(9901);
      expect(await ledgerBalance('suspense')).toBe(suspenseBefore - 10000);
    });

    it('omits the fee entry when the merchant pays no fee', async () => {
      const m = await merchant(undefined, { pixFeeBps: 0 });
      const payment = await m.createPix();
      const { endToEndId } = (await payPix(payment.pix.txid).expect(200))
        .body as { endToEndId: string };

      const entries: unknown[] = await dataSource.query(
        `SELECT e.account_id FROM ledger_entries e
           JOIN ledger_transactions t ON t.id = e.transaction_id
          WHERE t.external_reference = $1`,
        [endToEndId],
      );

      expect(entries).toHaveLength(2);
      expect(await pendingBalance(m)).toBe(10000);
    });
  });

  describe('expiry', () => {
    it('expires overdue charges and notifies the merchant', async () => {
      const m = await merchant('/expiry');
      const payment = await m.createPix({ expiresInSeconds: 60 });

      await app
        .get(ExpirePaymentsUseCase)
        .execute(new Date(Date.now() + 61_000));

      const after = (await m.get(`/v1/payments/${payment.id}`).expect(200))
        .body as PaymentBody;
      expect(after.status).toBe('expired');
      await payPix(payment.pix.txid).expect(422);
      await dispatch();
      const types = receiver
        .deliveriesTo('/expiry')
        .map((d) => (JSON.parse(d.body) as EventBody).type);
      expect(types).toContain('payment.expired');
    });
  });

  describe('POST /v1/payments/:id/cancel', () => {
    it('cancels a pending charge, idempotently', async () => {
      const m = await merchant();
      const payment = await m.createPix();

      const first = await m
        .post(`/v1/payments/${payment.id}/cancel`)
        .expect(200);
      const second = await m
        .post(`/v1/payments/${payment.id}/cancel`)
        .expect(200);

      expect((first.body as PaymentBody).status).toBe('canceled');
      expect(second.body).toEqual(first.body);
      await payPix(payment.pix.txid).expect(422);
    });

    it('refuses to cancel a paid charge', async () => {
      const m = await merchant();
      const payment = await m.createPix();
      await payPix(payment.pix.txid).expect(200);

      const res = await m.post(`/v1/payments/${payment.id}/cancel`).expect(422);

      expect((res.body as ErrorBody).error).toBe('payments.not_cancelable');
    });

    it("cannot see or cancel another merchant's payment", async () => {
      const alice = await merchant();
      const bob = await merchant();
      const payment = await alice.createPix();

      await bob.get(`/v1/payments/${payment.id}`).expect(404);
      await bob.post(`/v1/payments/${payment.id}/cancel`).expect(404);
    });
  });

  describe('webhook delivery', () => {
    it('retries with backoff until the endpoint accepts', async () => {
      const m = await merchant('/flaky');
      receiver.respondWith('/flaky', 500);
      await m.createPix();

      await dispatch();
      expect(receiver.deliveriesTo('/flaky')).toHaveLength(1);
      const [row]: { attempts: number; last_response_status: number }[] =
        await dataSource.query(
          `SELECT d.attempts, d.last_response_status FROM webhook_deliveries d
             JOIN webhook_endpoints w ON w.id = d.endpoint_id
            WHERE w.merchant_id = $1`,
          [m.id],
        );
      expect(row).toEqual({ attempts: 1, last_response_status: 500 });

      await dispatch(); // not due yet: the first retry waits 30 seconds
      expect(receiver.deliveriesTo('/flaky')).toHaveLength(1);

      await dispatch(new Date(Date.now() + 31_000));
      expect(receiver.deliveriesTo('/flaky')).toHaveLength(2);
      const [delivered]: { status: string }[] = await dataSource.query(
        `SELECT d.status FROM webhook_deliveries d
           JOIN webhook_endpoints w ON w.id = d.endpoint_id
          WHERE w.merchant_id = $1`,
        [m.id],
      );
      expect(delivered.status).toBe('succeeded');
    });

    it('stops delivering to a disabled endpoint', async () => {
      const m = await merchant('/disabled');
      const [endpoint] = (await m.get('/v1/webhook_endpoints').expect(200))
        .body as { id: string }[];
      await m
        .post('/v1/payments', { amount: 100, currency: 'BRL', method: 'pix' })
        .expect(201);

      await m.delete(`/v1/webhook_endpoints/${endpoint.id}`).expect(200);
      await dispatch();

      expect(receiver.deliveriesTo('/disabled')).toHaveLength(0);
    });
  });

  describe('GET /v1/events', () => {
    it('lets the merchant reconcile events, filtered by type', async () => {
      const m = await merchant();
      const payment = await m.createPix();
      await payPix(payment.pix.txid).expect(200);

      const res = await m.get('/v1/events?type=payment.succeeded').expect(200);
      const [event] = res.body as EventBody[];

      expect(res.body).toHaveLength(1);
      expect(event.data.object.id).toBe(payment.id);
      await m.get(`/v1/events/${event.id}`).expect(200);
      await (await merchant()).get(`/v1/events/${event.id}`).expect(404);
    });
  });

  describe('/v1/webhook_endpoints', () => {
    type EndpointBody = {
      id: string;
      secret: string;
      disabledAt: string | null;
    };

    it('shows the signing secret only when the endpoint is created', async () => {
      const m = await merchant();
      const key = nextKey();
      const body = { url: receiver.url('/secret') };

      const created = (
        await m.post('/v1/webhook_endpoints', body, key).expect(201)
      ).body as EndpointBody;
      const replay = (
        await m.post('/v1/webhook_endpoints', body, key).expect(201)
      ).body as EndpointBody;
      const [listed] = (await m.get('/v1/webhook_endpoints').expect(200))
        .body as EndpointBody[];

      expect(created.secret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
      const masked = `whsec_…${created.secret.slice(-4)}`;
      expect(replay.secret).toBe(masked);
      expect(listed.secret).toBe(masked);
    });

    it.each([
      ['not a url'],
      ['ftp://example.com/hook'],
      ['//example.com/hook'],
    ])('rejects %s', async (url) => {
      await (await merchant())
        .post('/v1/webhook_endpoints', { url })
        .expect(400);
    });

    it("cannot disable another merchant's endpoint", async () => {
      const alice = await merchant('/alice');
      const [endpoint] = (await alice.get('/v1/webhook_endpoints').expect(200))
        .body as EndpointBody[];

      await (await merchant())
        .delete(`/v1/webhook_endpoints/${endpoint.id}`)
        .expect(404);
    });
  });
});
