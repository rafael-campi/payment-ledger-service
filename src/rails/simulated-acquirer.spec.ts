import { SimulatedAcquirer, TestCards } from './simulated-acquirer';

describe('SimulatedAcquirer', () => {
  const acquirer = new SimulatedAcquirer();
  const authorize = (pan: string, idempotencyKey = 'pay_1') =>
    acquirer.authorize({ idempotencyKey, pan });

  it.each([
    [TestCards.DECLINED, 'card_declined'],
    [TestCards.INSUFFICIENT_FUNDS, 'insufficient_funds'],
    [TestCards.EXPIRED_AT_ISSUER, 'expired_card'],
    [TestCards.PROCESSING_ERROR, 'processing_error'],
  ])('declines %s with %s', async (pan, declineCode) => {
    expect(await authorize(pan)).toEqual({ approved: false, declineCode });
  });

  it('approves any other card, idempotently on the key', async () => {
    const first = await authorize(TestCards.APPROVED_VISA, 'pay_1');
    const retry = await authorize(TestCards.APPROVED_VISA, 'pay_1');
    const other = await authorize(TestCards.APPROVED_VISA, 'pay_2');

    expect(first).toEqual(retry);
    expect(first.approved && first.authorizationId).toMatch(
      /^auth_[0-9a-f]{24}$/,
    );
    expect(other).not.toEqual(first);
  });
});
