import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AccountType } from '../src/ledger/domain/entities/account.entity';
import { OpenAccountsUseCase } from '../src/ledger/application/use-cases/open-accounts.usecase';
import { createTestApp, PLATFORM } from './helpers/app';

type TxBody = {
  id: string;
  externalReference: string;
  entries: { amount: number }[];
};
type ErrorBody = { error: string };
type AccountBody = { id: string; type: string; balance: number };

let keySequence = 0;
const nextKey = () => `test-key-${++keySequence}`;

// a counter, not the clock: two calls in the same millisecond must still differ
let referenceSequence = 0;
const pixReceived = (reference = `E-${++referenceSequence}`) => ({
  description: 'Manual adjustment',
  source: 'manual',
  externalReference: reference,
  entries: [
    { accountId: 'pix-settlement', amount: 10000, currency: 'BRL' },
    { accountId: 'merchant:7:available', amount: -9901, currency: 'BRL' },
    { accountId: 'fee-revenue', amount: -99, currency: 'BRL' },
  ],
});

type Body = ReturnType<typeof pixReceived>;

describe('Ledger (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await app.get(OpenAccountsUseCase).execute([
      {
        id: 'merchant:7:available',
        type: AccountType.LIABILITY,
        currency: 'BRL',
      },
      { id: 'usd-cash', type: AccountType.ASSET, currency: 'USD' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: object, key: string | null = nextKey()) => {
    const req = request(app.getHttpServer())
      .post('/ledger/transactions')
      .set('Authorization', PLATFORM);
    return key === null
      ? req.send(body)
      : req.set('Idempotency-Key', key).send(body);
  };

  describe('authentication', () => {
    it.each([
      ['no token', undefined],
      ['a wrong token', 'Bearer not-the-token'],
    ])('rejects %s with 401', async (_, authorization) => {
      const req = request(app.getHttpServer()).get('/ledger/transactions');
      if (authorization) req.set('Authorization', authorization);

      await req.expect(401);
    });
  });

  describe('POST /ledger/transactions', () => {
    it('appends a balanced transaction and returns it', async () => {
      const body = pixReceived();

      const res = await post(body).expect(201);

      const tx = res.body as TxBody;
      expect(tx.id).toEqual(expect.any(String));
      expect(tx.externalReference).toBe(body.externalReference);
      expect(tx.entries.map((e) => e.amount)).toEqual([10000, -9901, -99]);
    });

    it('requires an Idempotency-Key', async () => {
      await post(pixReceived(), null).expect(400);
    });

    it('replays the stored response for a repeated key and body', async () => {
      const key = nextKey();
      const body = pixReceived();

      const first = await post(body, key).expect(201);
      const second = await post({ ...body }, key).expect(201);

      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
    });

    it('rejects a key reused with a different body', async () => {
      const key = nextKey();
      await post(pixReceived(), key).expect(201);

      await post(pixReceived(), key).expect(422);
    });

    it('lets the client retry a key whose request failed', async () => {
      const key = nextKey();
      const body = pixReceived();
      const unbalanced = { ...body, entries: body.entries.slice(0, 2) };

      await post(unbalanced, key).expect(422);
      // same key, different body: allowed because the failure was not stored
      await post(body, key).expect(201);
    });

    it('returns the existing transaction when the same reference is posted with a new key', async () => {
      const body = pixReceived();
      const first = await post(body).expect(201);

      const second = await post(body).expect(201);

      expect((second.body as TxBody).id).toBe((first.body as TxBody).id);
    });

    it('rejects the same reference with different content', async () => {
      const body = pixReceived();
      await post(body).expect(201);
      body.entries[1].amount = -9900;
      body.entries[2].amount = -100;

      const res = await post(body).expect(409);

      expect((res.body as ErrorBody).error).toBe('ledger.reference_conflict');
    });

    it.each([
      [
        'an unbalanced transaction',
        (b: Body) => ({ ...b, entries: [b.entries[0], b.entries[1]] }),
        'ledger.unbalanced',
      ],
      [
        'mixed currencies',
        (b: Body) => ({
          ...b,
          entries: [
            { accountId: 'usd-cash', amount: 100, currency: 'USD' },
            { accountId: 'fee-revenue', amount: -100, currency: 'BRL' },
          ],
        }),
        'ledger.mixed_currencies',
      ],
      [
        'an account that does not exist',
        (b: Body) => ({
          ...b,
          entries: [
            { accountId: 'bank', amount: 100, currency: 'BRL' },
            {
              accountId: 'merchant:nobody:available',
              amount: -100,
              currency: 'BRL',
            },
          ],
        }),
        'ledger.unknown_account',
      ],
      [
        'a currency the account does not hold',
        (b: Body) => ({
          ...b,
          entries: [
            { accountId: 'usd-cash', amount: 100, currency: 'BRL' },
            { accountId: 'fee-revenue', amount: -100, currency: 'BRL' },
          ],
        }),
        'ledger.account_currency_mismatch',
      ],
    ])('rejects %s with 422', async (_, mutate, code) => {
      const res = await post(mutate(pixReceived())).expect(422);

      expect((res.body as ErrorBody).error).toBe(code);
    });

    it.each([
      ['a fractional amount', { amount: 100.5 }],
      ['an amount sent as string', { amount: '100' }],
      ['a lowercase currency', { currency: 'brl' }],
    ])('rejects %s with 400', async (_, override) => {
      const body = pixReceived();
      body.entries[0] = { ...body.entries[0], ...override } as never;

      await post(body).expect(400);
    });

    it.each([
      [
        'a source reserved for the PSP flows',
        { source: 'pix' },
        'ledger.reserved_source',
      ],
      [
        'a scheduled pending account',
        {
          entries: [
            { accountId: 'bank', amount: 100, currency: 'BRL' },
            { accountId: 'merchant:7:pending', amount: -100, currency: 'BRL' },
          ],
        },
        'ledger.pending_is_scheduled',
      ],
    ])('refuses a manual posting with %s', async (_, override, code) => {
      const res = await post({ ...pixReceived(), ...override }).expect(422);

      expect((res.body as ErrorBody).error).toBe(code);
    });

    it('rejects unknown fields', async () => {
      await post({ ...pixReceived(), balance: 1 }).expect(400);
    });
  });

  describe('Idempotency-Key lifetime', () => {
    const age = (key: string, interval: string) =>
      dataSource.query(
        `UPDATE idempotency_keys SET created_at = now() - $2::interval
          WHERE idempotency_key = $1`,
        [key, interval],
      );

    it('can be reused with another body after 24 hours', async () => {
      const key = nextKey();
      await post(pixReceived(), key).expect(201);
      await age(key, '25 hours');

      const res = await post(pixReceived(), key).expect(201);

      expect(res.headers['idempotent-replayed']).toBeUndefined();
    });

    it('is handed over when the first request died mid-flight', async () => {
      const key = nextKey();
      const body = pixReceived();
      const first = await post(body, key).expect(201);
      // the process died after posting to the ledger, before storing the response
      await dataSource.query(
        `UPDATE idempotency_keys SET status = 'in_progress', response_body = NULL
          WHERE idempotency_key = $1`,
        [key],
      );
      await post(body, key).expect(409);

      await age(key, '6 minutes');
      const retry = await post(body, key).expect(201);

      // the ledger's own idempotency keeps the money from moving twice
      expect((retry.body as TxBody).id).toBe((first.body as TxBody).id);
    });
  });

  describe('GET /ledger/transactions', () => {
    it('lists posted transactions with their entries', async () => {
      const body = pixReceived();
      await post(body).expect(201);

      const res = await request(app.getHttpServer())
        .get('/ledger/transactions')
        .set('Authorization', PLATFORM)
        .expect(200);

      const tx = (res.body as TxBody[]).find(
        (t) => t.externalReference === body.externalReference,
      );
      expect(tx?.entries).toHaveLength(3);
    });
  });

  describe('GET /ledger/accounts', () => {
    it('lists the chart of accounts with derived balances that sum to zero', async () => {
      const res = await request(app.getHttpServer())
        .get('/ledger/accounts')
        .set('Authorization', PLATFORM)
        .expect(200);

      const accounts = res.body as AccountBody[];
      expect(accounts.map((a) => a.id)).toEqual(
        expect.arrayContaining([
          'pix-settlement',
          'acquirer-receivable',
          'bank',
          'payout-in-transit',
          'fee-revenue',
          'rail-costs',
          'suspense',
        ]),
      );
      const pix = accounts.find((a) => a.id === 'pix-settlement');
      expect(pix?.balance).toBeGreaterThan(0);
      expect(accounts.reduce((sum, a) => sum + a.balance, 0)).toBe(0);
    });
  });

  describe('database guarantees', () => {
    it('rejects updating or deleting ledger rows', async () => {
      const res = await post(pixReceived()).expect(201);
      const { id } = res.body as TxBody;

      await expect(
        dataSource.query(
          `UPDATE ledger_entries SET amount = 1 WHERE transaction_id = $1`,
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        dataSource.query(`DELETE FROM ledger_transactions WHERE id = $1`, [id]),
      ).rejects.toThrow(/append-only/);
      await expect(dataSource.query(`TRUNCATE ledger_entries`)).rejects.toThrow(
        /append-only/,
      );
      await expect(
        dataSource.query(
          `UPDATE ledger_accounts SET currency = 'USD' WHERE id = 'bank'`,
        ),
      ).rejects.toThrow(/append-only/);
    });

    const insertBehindTheDomain = (
      id: string,
      entries: [string, number, string][],
    ) =>
      dataSource.transaction(async (m) => {
        await m.query(
          `INSERT INTO ledger_transactions (id, description, source, external_reference)
           VALUES ($1::uuid, 'bypass', 'manual', $1::text)`,
          [id],
        );
        for (const [account, amount, currency] of entries) {
          await m.query(
            `INSERT INTO ledger_entries (id, transaction_id, account_id, amount, currency)
             VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
            [id, account, amount, currency],
          );
        }
      });

    it('refuses to commit an unbalanced transaction written behind the domain', async () => {
      const id = '00000000-0000-4000-8000-000000000001';

      await expect(
        insertBehindTheDomain(id, [
          ['bank', 100, 'BRL'],
          ['fee-revenue', -99, 'BRL'],
        ]),
      ).rejects.toThrow(/not balanced/);

      const [{ count }]: { count: string }[] = await dataSource.query(
        `SELECT count(*) FROM ledger_transactions WHERE id = $1`,
        [id],
      );
      expect(Number(count)).toBe(0);
    });

    it('refuses entries in a currency the account does not hold', async () => {
      await expect(
        insertBehindTheDomain('00000000-0000-4000-8000-000000000002', [
          ['usd-cash', 100, 'BRL'],
          ['fee-revenue', -100, 'BRL'],
        ]),
      ).rejects.toThrow(/fk_ledger_entries_account/);
    });
  });
});
