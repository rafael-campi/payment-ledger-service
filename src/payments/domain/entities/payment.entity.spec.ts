import { DomainError } from '../../../shared/errors';
import {
  Payment,
  PaymentMethod,
  PaymentProps,
  PaymentStatus,
} from './payment.entity';

const createdAt = new Date('2026-10-21T12:00:00Z');
const expiresAt = new Date('2026-10-21T13:00:00Z');

const base: PaymentProps = {
  id: 'pay_1',
  merchantId: 'mch_1',
  amount: 10000,
  currency: 'BRL',
  method: PaymentMethod.PIX,
  status: PaymentStatus.PENDING,
  description: null,
  metadata: {},
  fee: 99,
  pix: {
    txid: 't'.repeat(32),
    copiaECola: '000201',
    endToEndId: null,
    paidAt: null,
  },
  card: null,
  failureCode: null,
  amountRefunded: 0,
  expiresAt,
  createdAt,
  updatedAt: createdAt,
};

const pendingPix = () => new Payment(base);

const pendingCard = (capture = true) =>
  new Payment({
    ...base,
    method: PaymentMethod.CREDIT_CARD,
    fee: 299,
    pix: null,
    card: {
      tokenId: 'tok_1',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
      installments: 1,
      capture,
      authorizationId: null,
      authorizedAt: null,
      capturedAt: null,
    },
  });

describe('Payment', () => {
  it('computes what the merchant receives', () => {
    expect(pendingPix().net).toBe(9901);
  });

  describe('Pix', () => {
    it('is payable only while pending and before expiry', () => {
      const payment = pendingPix();

      expect(payment.isPayableAt(new Date('2026-10-21T12:59:59Z'))).toBe(true);
      expect(payment.isPayableAt(expiresAt)).toBe(false);
      expect(payment.cancel(createdAt).isPayableAt(createdAt)).toBe(false);
    });

    it('succeeds with the Pix endToEndId, without mutating the original', () => {
      const paidAt = new Date('2026-10-21T12:30:00Z');
      const payment = pendingPix();

      const succeeded = payment.succeedWithPix('E123', paidAt);

      expect(succeeded.status).toBe(PaymentStatus.SUCCEEDED);
      expect(succeeded.pix).toMatchObject({ endToEndId: 'E123', paidAt });
      expect(succeeded.updatedAt).toEqual(paidAt);
      expect(payment.status).toBe(PaymentStatus.PENDING);
    });

    it('cannot be authorized like a card', () => {
      expect(() => pendingPix().authorize('auth_1', createdAt)).toThrow(
        DomainError,
      );
    });
  });

  describe('card', () => {
    const at = new Date('2026-10-21T12:01:00Z');

    it('goes pending → authorized → succeeded', () => {
      const authorized = pendingCard().authorize('auth_1', at);
      const captured = authorized.capture(at);

      expect(authorized.status).toBe(PaymentStatus.AUTHORIZED);
      expect(authorized.card).toMatchObject({
        authorizationId: 'auth_1',
        authorizedAt: at,
        capturedAt: null,
      });
      expect(captured.status).toBe(PaymentStatus.SUCCEEDED);
      expect(captured.card?.capturedAt).toEqual(at);
    });

    it('records why it failed', () => {
      const failed = pendingCard().fail('insufficient_funds', at);

      expect(failed.status).toBe(PaymentStatus.FAILED);
      expect(failed.failureCode).toBe('insufficient_funds');
    });

    it('can only be captured once authorized', () => {
      expect(() => pendingCard().capture(at)).toThrow(DomainError);
    });

    it.each([
      ['canceled', (p: Payment) => p.cancel(at)],
      ['expired', (p: Payment) => p.expire(at)],
    ])('can be %s while authorized', (_, close) => {
      const authorized = pendingCard().authorize('auth_1', at);

      expect(close(authorized).isOpen).toBe(false);
    });
  });

  it.each([
    ['succeeded', (p: Payment) => p.succeedWithPix('E1', createdAt)],
    ['expired', (p: Payment) => p.expire(createdAt)],
    ['canceled', (p: Payment) => p.cancel(createdAt)],
    ['failed', (p: Payment) => p.fail('card_declined', createdAt)],
  ])('cannot leave the %s state', (_, settle) => {
    const settled = settle(pendingPix());

    for (const move of [
      () => settled.succeedWithPix('E2', createdAt),
      () => settled.expire(createdAt),
      () => settled.cancel(createdAt),
      () => settled.fail('card_declined', createdAt),
    ]) {
      expect(move).toThrow(DomainError);
    }
  });

  describe('refunds', () => {
    const at = new Date('2026-10-22T12:00:00Z');
    const succeeded = () => pendingPix().succeedWithPix('E1', createdAt);

    it('reserves partial refunds and becomes refunded when fully refunded', () => {
      const partial = succeeded().refund(4000, at);
      const full = partial.refund(6000, at);

      expect(partial).toMatchObject({
        status: PaymentStatus.SUCCEEDED,
        amountRefunded: 4000,
      });
      expect(partial.refundable).toBe(6000);
      expect(full).toMatchObject({
        status: PaymentStatus.REFUNDED,
        amountRefunded: 10000,
      });
      expect(full.refundable).toBe(0);
    });

    it.each([
      ['more than was paid', 10001],
      ['zero', 0],
      ['a fraction of a cent', 10.5],
    ])('refuses to refund %s', (_, amount) => {
      expect(() => succeeded().refund(amount, at)).toThrow(DomainError);
    });

    it('refuses to refund a payment that did not succeed', () => {
      expect(() => pendingPix().refund(100, at)).toThrow(DomainError);
    });

    it('gives a refused refund back', () => {
      const reverted = succeeded().refund(10000, at).revertRefund(10000, at);

      expect(reverted).toMatchObject({
        status: PaymentStatus.SUCCEEDED,
        amountRefunded: 0,
      });
    });
  });
});
