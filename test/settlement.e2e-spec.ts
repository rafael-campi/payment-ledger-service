import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TestCards } from '../src/rails/simulated-acquirer';
import { PIX_RAIL } from '../src/rails/pix-rail';
import type { PixRail } from '../src/rails/pix-rail';
import { ACQUIRER_RAIL } from '../src/rails/acquirer-rail';
import type { AcquirerRail } from '../src/rails/acquirer-rail';
import { ReleaseReceivablesUseCase } from '../src/settlement/application/use-cases/release-receivables.usecase';
import { RecoverRefundsUseCase } from '../src/payments/application/use-cases/recover-refunds.usecase';
import { createTestApp, PLATFORM } from './helpers/app';

type PaymentBody = { id: string; status: string; amountRefunded: number };
type RefundBody = {
  id: string;
  status: string;
  amount: number;
  fundedFrom: { pending: number; available: number };
  failureCode: string | null;
};
type ReceivableBody = {
  installment: number;
  amount: number;
  availableOn: string;
  status: string;
};
type PayoutBody = {
  id: string;
  status: string;
  amount: number;
  failureCode: string | null;
};
type ErrorBody = { error: string };

const DAY = 24 * 3600_000;
let keySequence = 0;
const nextKey = () => `settlement-key-${++keySequence}`;

describe('Settlement (e2e)', () => {
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
  const release = (at: Date) => app.get(ReleaseReceivablesUseCase).execute(at);

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
      get: (path: string) => http().get(path).set('Authorization', sk),
      post: (path: string, payload: object = {}, idempotencyKey = nextKey()) =>
        http()
          .post(path)
          .set('Authorization', sk)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
      patch: (path: string, payload: object) =>
        http()
          .patch(path)
          .set('Authorization', sk)
          .set('Idempotency-Key', nextKey())
          .send(payload),
      /** A Pix of R$ 100,00, paid: net 9901 (0.99% fee). */
      paidPix: async () => {
        const payment = (
          await m
            .post('/v1/payments', {
              amount: 10000,
              currency: 'BRL',
              method: 'pix',
            })
            .expect(201)
        ).body as PaymentBody & { pix: { txid: string } };
        await http().post(`/simulator/pix/${payment.pix.txid}/pay`).expect(200);
        return payment;
      },
      /** A card payment of R$ 100,00 in `installments`: net 9701 (2.99% fee). */
      paidCard: async (installments = 1) => {
        const token = (
          await http()
            .post('/v1/tokens')
            .set('Authorization', pk)
            .send({
              card: {
                number: TestCards.APPROVED_VISA,
                expMonth: 12,
                expYear: 2030,
                cvc: '123',
              },
            })
            .expect(201)
        ).body as { id: string };
        return (
          await m
            .post('/v1/payments', {
              amount: 10000,
              currency: 'BRL',
              method: 'credit_card',
              card: { token: token.id, installments },
            })
            .expect(201)
        ).body as PaymentBody;
      },
      balance: async () => {
        const body = (await m.get('/v1/balance').expect(200)).body as {
          available: { amount: number }[];
          pending: { amount: number }[];
        };
        return {
          available: body.available[0].amount,
          pending: body.pending[0].amount,
        };
      },
      receivables: async () =>
        (await m.get('/v1/receivables').expect(200)).body as ReceivableBody[],
      refund: (payment: string, amount?: number) =>
        m.post('/v1/refunds', { payment, ...(amount ? { amount } : {}) }),
      eventTypes: async () =>
        (
          (await m.get('/v1/events?limit=100').expect(200)).body as {
            type: string;
          }[]
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

  /** merchant:pending must always equal what the schedule has left to release. */
  async function expectPendingMatchesSchedule(
    m: Awaited<ReturnType<typeof merchant>>,
  ) {
    const [row]: { scheduled: string }[] = await dataSource.query(
      `SELECT COALESCE(SUM(amount - reversed_amount), 0) AS scheduled
         FROM receivables WHERE merchant_id = $1 AND released_at IS NULL`,
      [m.id],
    );
    expect((await m.balance()).pending).toBe(Number(row.scheduled));
  }

  async function expectNothingInTransit() {
    expect(await ledgerBalance('refund-in-transit')).toBe(0);
    expect(await ledgerBalance('payout-in-transit')).toBe(0);
    const [{ total }]: { total: string }[] = await dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries`,
    );
    expect(Number(total)).toBe(0);
  }

  describe('receivables schedule', () => {
    it('releases a Pix the same day', async () => {
      const m = await merchant();
      await m.paidPix();

      const [receivable] = await m.receivables();
      expect(receivable).toMatchObject({
        installment: 1,
        amount: 9901,
        status: 'scheduled',
      });
      expect(await m.balance()).toEqual({ available: 0, pending: 9901 });

      await release(new Date(Date.now() + 1000));

      expect(await m.balance()).toEqual({ available: 9901, pending: 0 });
      expect((await m.receivables())[0].status).toBe('released');
      await expectPendingMatchesSchedule(m);
    });

    it('releases each card installment 30 days apart', async () => {
      const m = await merchant();
      await m.paidCard(3);

      const schedule = await m.receivables();
      expect(schedule.map((r) => r.amount)).toEqual([3235, 3233, 3233]);
      const firstDue = Date.parse(schedule[0].availableOn) - Date.now();
      expect(firstDue).toBeGreaterThan(29 * DAY);
      expect(firstDue).toBeLessThanOrEqual(30 * DAY);

      await release(new Date(Date.now() + 31 * DAY));

      expect(await m.balance()).toEqual({ available: 3235, pending: 6466 });
      await expectPendingMatchesSchedule(m);
    });
  });

  describe('refunds', () => {
    it('takes a partial card refund from the latest unreleased installments', async () => {
      const m = await merchant();
      const payment = await m.paidCard(3);
      const receivableBefore = await ledgerBalance('acquirer-receivable');

      const refund = (await m.refund(payment.id, 5000).expect(201))
        .body as RefundBody;

      expect(refund).toMatchObject({
        status: 'succeeded',
        amount: 5000,
        fundedFrom: { pending: 5000, available: 0 },
      });
      // installment 3 (3233) goes whole, installment 2 gives 1767
      expect((await m.receivables()).map((r) => r.amount)).toEqual([
        3235, 1466, 0,
      ]);
      expect(await m.balance()).toEqual({ available: 0, pending: 4701 });
      expect(await ledgerBalance('acquirer-receivable')).toBe(
        receivableBefore - 5000,
      );
      const after = (await m.get(`/v1/payments/${payment.id}`).expect(200))
        .body as PaymentBody;
      expect(after).toMatchObject({
        status: 'succeeded',
        amountRefunded: 5000,
      });
      await expectPendingMatchesSchedule(m);
      await expectNothingInTransit();
    });

    it('funds a full refund from the available balance, keeping the fee', async () => {
      const m = await merchant();
      const payment = await m.paidPix();
      await release(new Date(Date.now() + 1000));
      const settlementBefore = await ledgerBalance('pix-settlement');

      const refund = (await m.refund(payment.id).expect(201))
        .body as RefundBody;

      expect(refund.fundedFrom).toEqual({ pending: 0, available: 10000 });
      // the merchant had 9901 and gave back 10000: it owes the 99 fee
      expect(await m.balance()).toEqual({ available: -99, pending: 0 });
      expect(await ledgerBalance('pix-settlement')).toBe(
        settlementBefore - 10000,
      );
      const after = (await m.get(`/v1/payments/${payment.id}`).expect(200))
        .body as PaymentBody;
      expect(after.status).toBe('refunded');
      expect(await m.eventTypes()).toEqual(
        expect.arrayContaining(['refund.succeeded', 'payment.refunded']),
      );
      await expectNothingInTransit();
    });

    it('never refunds more than was paid, even with concurrent requests', async () => {
      const m = await merchant();
      const payment = await m.paidPix();

      const results = await Promise.all([
        m.refund(payment.id, 6000),
        m.refund(payment.id, 6000),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      const failed = results.find((r) => r.status === 422)!;
      expect((failed.body as ErrorBody).error).toBe(
        'refunds.amount_not_refundable',
      );
      await m.refund(payment.id, 4001).expect(422);
      await m.refund(payment.id, 4000).expect(201);
    });

    it.each([
      ['a pending payment', 'pending'],
      ['another merchant', 'other'],
    ])('refuses to refund %s', async (_, kind) => {
      const m = await merchant();
      const pending = (
        await m
          .post('/v1/payments', { amount: 100, currency: 'BRL', method: 'pix' })
          .expect(201)
      ).body as PaymentBody;

      if (kind === 'pending') {
        const res = await m.refund(pending.id).expect(422);
        expect((res.body as ErrorBody).error).toBe(
          'refunds.payment_not_refundable',
        );
      } else {
        await (await merchant()).refund(pending.id).expect(404);
      }
    });

    it('undoes everything exactly when the rail refuses the refund', async () => {
      const m = await merchant();
      const payment = await m.paidCard(3);
      await release(new Date(Date.now() + 31 * DAY)); // installment 1 released
      const before = await m.balance();
      const scheduleBefore = await m.receivables();
      jest
        .spyOn(app.get<AcquirerRail>(ACQUIRER_RAIL), 'refund')
        .mockResolvedValueOnce({ ok: false, reason: 'chargeback_in_progress' });

      const refund = (await m.refund(payment.id).expect(201))
        .body as RefundBody;

      expect(refund).toMatchObject({
        status: 'failed',
        failureCode: 'chargeback_in_progress',
      });
      expect(refund.fundedFrom).toEqual({ pending: 6466, available: 3534 });
      expect(await m.balance()).toEqual(before);
      expect(await m.receivables()).toEqual(scheduleBefore);
      const after = (await m.get(`/v1/payments/${payment.id}`).expect(200))
        .body as PaymentBody;
      expect(after).toMatchObject({ status: 'succeeded', amountRefunded: 0 });
      expect(await m.eventTypes()).toContain('refund.failed');
      await expectPendingMatchesSchedule(m);
      await expectNothingInTransit();
    });

    it('finishes a refund the rail did not answer, later', async () => {
      const m = await merchant();
      const payment = await m.paidPix();
      jest
        .spyOn(app.get<PixRail>(PIX_RAIL), 'refund')
        .mockRejectedValueOnce(new Error('timeout'));

      const pending = (await m.refund(payment.id).expect(201))
        .body as RefundBody;
      expect(pending.status).toBe('pending');
      expect(await ledgerBalance('refund-in-transit')).toBeLessThan(0);

      await app
        .get(RecoverRefundsUseCase)
        .execute(new Date(Date.now() + 61_000));

      const after = (await m.get(`/v1/refunds/${pending.id}`).expect(200))
        .body as RefundBody;
      expect(after.status).toBe('succeeded');
      await expectNothingInTransit();
    });
  });

  describe('payouts', () => {
    async function withAvailable(amountPaid: 'pix' = 'pix') {
      const m = await merchant();
      if (amountPaid === 'pix') await m.paidPix();
      await release(new Date(Date.now() + 1000));
      return m;
    }

    it('requires a payout key, validated and stored canonical', async () => {
      const m = await withAvailable();

      const missing = await m.post('/v1/payouts').expect(422);
      expect((missing.body as ErrorBody).error).toBe(
        'settlement.no_payout_key',
      );
      const bad = await m
        .patch('/v1/account', { payoutPixKey: '111.111.111-11' })
        .expect(422);
      expect((bad.body as ErrorBody).error).toBe('settlement.invalid_pix_key');

      const ok = await m
        .patch('/v1/account', { payoutPixKey: '529.982.247-25' })
        .expect(200);
      expect((ok.body as { payoutPixKey: string }).payoutPixKey).toBe(
        '52998224725',
      );
    });

    it('pays out the whole available balance by Pix', async () => {
      const m = await withAvailable();
      await m
        .patch('/v1/account', { payoutPixKey: 'loja@prateleira.com.br' })
        .expect(200);
      const settlementBefore = await ledgerBalance('pix-settlement');

      const payout = (await m.post('/v1/payouts').expect(201))
        .body as PayoutBody;

      expect(payout).toMatchObject({ status: 'paid', amount: 9901 });
      expect(await m.balance()).toEqual({ available: 0, pending: 0 });
      expect(await ledgerBalance('pix-settlement')).toBe(
        settlementBefore - 9901,
      );
      expect(await m.eventTypes()).toContain('payout.paid');
      await expectNothingInTransit();
    });

    it.each([
      [{ amount: 9902 }, 'settlement.insufficient_balance'],
      [{ amount: 99 }, 'settlement.amount_too_small'],
    ])('refuses %j', async (body, code) => {
      const m = await withAvailable();
      await m
        .patch('/v1/account', { payoutPixKey: 'loja@prateleira.com.br' })
        .expect(200);

      const res = await m.post('/v1/payouts', body).expect(422);

      expect((res.body as ErrorBody).error).toBe(code);
    });

    it('cannot pay out pending money', async () => {
      const m = await merchant();
      await m.paidCard();
      await m
        .patch('/v1/account', { payoutPixKey: 'loja@prateleira.com.br' })
        .expect(200);

      await m.post('/v1/payouts').expect(422);
    });

    it('gives the money back when the key does not exist', async () => {
      const m = await withAvailable();
      await m
        .patch('/v1/account', { payoutPixKey: 'naoexiste@pix.example' })
        .expect(200);

      const payout = (await m.post('/v1/payouts').expect(201))
        .body as PayoutBody;

      expect(payout).toMatchObject({
        status: 'failed',
        failureCode: 'pix_key_not_found',
      });
      expect(await m.balance()).toEqual({ available: 9901, pending: 0 });
      expect(await m.eventTypes()).toContain('payout.failed');
      await expectNothingInTransit();
    });

    it('never pays out the same balance twice, even with concurrent requests', async () => {
      const m = await withAvailable();
      await m
        .patch('/v1/account', { payoutPixKey: 'loja@prateleira.com.br' })
        .expect(200);

      const results = await Promise.all([
        m.post('/v1/payouts', { amount: 6000 }),
        m.post('/v1/payouts', { amount: 6000 }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await m.balance()).toEqual({ available: 3901, pending: 0 });
      await expectNothingInTransit();
    });
  });
});
