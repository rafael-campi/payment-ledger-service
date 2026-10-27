import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TestCards } from '../src/rails/simulated-acquirer';
import { PIX_RAIL } from '../src/rails/pix-rail';
import type { PixRail } from '../src/rails/pix-rail';
import { ReleaseReceivablesUseCase } from '../src/settlement/application/use-cases/release-receivables.usecase';
import { createTestApp, PLATFORM } from './helpers/app';

type Report = {
  ok: boolean;
  checks: {
    name: string;
    ok: boolean;
    discrepancies: Record<string, string>[];
  }[];
};
type SuspenseItem = { endToEndId: string; amount: number; status: string };
type ErrorBody = { error: string };

let keySequence = 0;
const nextKey = () => `recon-key-${++keySequence}`;

describe('Reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let merchantId: string;
  let sk: string;
  let pixPaymentId: string;

  const http = () => request(app.getHttpServer());
  const asMerchant = (path: string, body: object = {}) =>
    http()
      .post(path)
      .set('Authorization', sk)
      .set('Idempotency-Key', nextKey())
      .send(body);
  const report = async () =>
    (
      await http()
        .get('/platform/reconciliation')
        .set('Authorization', PLATFORM)
        .expect(200)
    ).body as Report;
  const check = async (name: string) =>
    (await report()).checks.find((c) => c.name === name)!;
  const suspense = async () =>
    (
      await http()
        .get('/platform/suspense')
        .set('Authorization', PLATFORM)
        .expect(200)
    ).body as SuspenseItem[];
  const returnSuspense = (endToEndId: string) =>
    http()
      .post(`/platform/suspense/${endToEndId}/return`)
      .set('Authorization', PLATFORM)
      .set('Idempotency-Key', nextKey());
  const ledgerBalance = async (accountId: string) => {
    const [row]: { balance: string }[] = await dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = $1`,
      [accountId],
    );
    return Number(row.balance);
  };

  async function pixCharge(amount = 10000) {
    return (
      await asMerchant('/v1/payments', {
        amount,
        currency: 'BRL',
        method: 'pix',
      }).expect(201)
    ).body as { id: string; pix: { txid: string } };
  }

  /** An unmatched Pix: the payer sent a different amount than charged. */
  async function unmatchedPix() {
    const charge = await pixCharge(5000);
    const res = await http()
      .post(`/simulator/pix/${charge.pix.txid}/pay`)
      .send({ amount: 4321 })
      .expect(200);
    return (res.body as { endToEndId: string }).endToEndId;
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    const onboarded = (
      await http()
        .post('/platform/merchants')
        .set('Authorization', PLATFORM)
        .set('Idempotency-Key', nextKey())
        .send({ name: 'Loja Prateleira' })
        .expect(201)
    ).body as { id: string; apiKeys: { type: string; key: string }[] };
    merchantId = onboarded.id;
    sk = `Bearer ${onboarded.apiKeys.find((k) => k.type === 'secret')!.key}`;
    const pk = `Bearer ${onboarded.apiKeys.find((k) => k.type === 'publishable')!.key}`;

    // a realistic day: Pix, card in 3x, a partial refund, a release and a payout
    const pix = await pixCharge();
    pixPaymentId = pix.id;
    await http().post(`/simulator/pix/${pix.pix.txid}/pay`).expect(200);
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
    const card = (
      await asMerchant('/v1/payments', {
        amount: 30000,
        currency: 'BRL',
        method: 'credit_card',
        card: { token: token.id, installments: 3 },
      }).expect(201)
    ).body as { id: string };
    await asMerchant('/v1/refunds', { payment: card.id, amount: 7000 }).expect(
      201,
    );
    await app
      .get(ReleaseReceivablesUseCase)
      .execute(new Date(Date.now() + 1000));
    await http()
      .patch('/v1/account')
      .set('Authorization', sk)
      .set('Idempotency-Key', nextKey())
      .send({ payoutPixKey: 'loja@prateleira.com.br' })
      .expect(200);
    await asMerchant('/v1/payouts', { amount: 5000 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires the platform token', async () => {
    await http().get('/platform/reconciliation').expect(401);
    await http()
      .get('/platform/reconciliation')
      .set('Authorization', sk)
      .expect(401);
  });

  it('finds everything in agreement after a normal day', async () => {
    const result = await report();

    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checks.map((c) => c.name)).toEqual([
      'ledger_balanced',
      'refunds_in_transit',
      'payouts_in_transit',
      'pending_matches_schedule',
      'paid_payments_in_ledger',
      'ledger_money_has_an_owner',
      'refunded_amounts',
    ]);
  });

  describe('catches tampering', () => {
    it('a schedule that no longer matches the pending balance', async () => {
      await dataSource.query(
        `UPDATE receivables SET reversed_amount = reversed_amount + 1
          WHERE merchant_id = $1 AND released_at IS NULL AND reversed_amount < amount
            AND id = (SELECT id FROM receivables WHERE merchant_id = $1
                       AND released_at IS NULL AND reversed_amount < amount LIMIT 1)`,
        [merchantId],
      );
      try {
        const result = await check('pending_matches_schedule');
        expect(result.ok).toBe(false);
        expect(result.discrepancies[0].merchant_id).toBe(merchantId);
      } finally {
        await dataSource.query(
          `UPDATE receivables SET reversed_amount = reversed_amount - 1
            WHERE id = (SELECT id FROM receivables WHERE merchant_id = $1
                         AND released_at IS NULL AND reversed_amount > 0
                         ORDER BY reversed_amount DESC LIMIT 1)`,
          [merchantId],
        );
      }
      expect((await report()).ok).toBe(true);
    });

    it('a payment marked paid with no money in the ledger', async () => {
      const charge = await pixCharge(100);
      await dataSource.query(
        `UPDATE payments SET status = 'succeeded' WHERE id = $1`,
        [charge.id],
      );
      try {
        const result = await check('paid_payments_in_ledger');
        expect(result.ok).toBe(false);
        expect(result.discrepancies.map((d) => d.payment_id)).toContain(
          charge.id,
        );
      } finally {
        await dataSource.query(
          `UPDATE payments SET status = 'canceled' WHERE id = $1`,
          [charge.id],
        );
      }
    });

    it('a refunded amount that does not match the refunds', async () => {
      await dataSource.query(
        `UPDATE payments SET amount_refunded = amount_refunded + 1 WHERE id = $1`,
        [pixPaymentId],
      );
      try {
        const result = await check('refunded_amounts');
        expect(result.ok).toBe(false);
        expect(result.discrepancies[0].payment_id).toBe(pixPaymentId);
      } finally {
        await dataSource.query(
          `UPDATE payments SET amount_refunded = amount_refunded - 1 WHERE id = $1`,
          [pixPaymentId],
        );
      }
    });

    it('a payout stuck as pending while its money already left', async () => {
      const [payout]: { id: string }[] = await dataSource.query(
        `SELECT id FROM payouts WHERE status = 'paid' LIMIT 1`,
      );
      await dataSource.query(
        `UPDATE payouts SET status = 'pending' WHERE id = $1`,
        [payout.id],
      );
      try {
        expect((await check('payouts_in_transit')).ok).toBe(false);
      } finally {
        await dataSource.query(
          `UPDATE payouts SET status = 'paid' WHERE id = $1`,
          [payout.id],
        );
      }
    });
  });

  describe('suspense', () => {
    it('lists an unmatched Pix and returns it to the payer', async () => {
      const endToEndId = await unmatchedPix();
      const settlementBefore = await ledgerBalance('pix-settlement');
      const suspenseBefore = await ledgerBalance('suspense');

      const open = (await suspense()).find((s) => s.endToEndId === endToEndId);
      expect(open).toMatchObject({ amount: 4321, status: 'open' });

      const res = await returnSuspense(endToEndId).expect(201);

      expect((res.body as SuspenseItem).status).toBe('returned');
      expect(await ledgerBalance('pix-settlement')).toBe(
        settlementBefore - 4321,
      );
      expect(await ledgerBalance('suspense')).toBe(suspenseBefore + 4321);
      expect((await report()).ok).toBe(true);

      const again = await returnSuspense(endToEndId).expect(422);
      expect((again.body as ErrorBody).error).toBe('suspense.already_handled');
    });

    it('keeps the money in suspense when the rail refuses', async () => {
      const endToEndId = await unmatchedPix();
      const suspenseBefore = await ledgerBalance('suspense');
      jest
        .spyOn(app.get<PixRail>(PIX_RAIL), 'refund')
        .mockResolvedValueOnce({ ok: false, reason: 'payer_account_closed' });

      const res = await returnSuspense(endToEndId).expect(201);

      expect((res.body as SuspenseItem).status).toBe('return_failed');
      expect(await ledgerBalance('suspense')).toBe(suspenseBefore);
      expect((await report()).ok).toBe(true);
    });

    it('resumes a return the rail did not answer, and accounts for it meanwhile', async () => {
      const endToEndId = await unmatchedPix();
      jest
        .spyOn(app.get<PixRail>(PIX_RAIL), 'refund')
        .mockRejectedValueOnce(new Error('timeout'));

      const first = await returnSuspense(endToEndId).expect(201);
      expect((first.body as SuspenseItem).status).toBe('returning');
      // money in refund-in-transit is explained by the return in flight
      expect((await report()).ok).toBe(true);

      const second = await returnSuspense(endToEndId).expect(201);
      expect((second.body as SuspenseItem).status).toBe('returned');
      expect((await report()).ok).toBe(true);
    });

    it('404s an unknown Pix', async () => {
      await returnSuspense('E00000000000000000000000000nope').expect(404);
    });
  });
});
