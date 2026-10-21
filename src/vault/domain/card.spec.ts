import { DomainError } from '../../shared/errors';
import { detectBrand, luhnValid, validateCard } from './card';

const now = new Date('2026-10-21T12:00:00Z');
const valid = {
  number: '4242424242424242',
  expMonth: 12,
  expYear: 2030,
  cvc: '123',
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not-a-domain-error';
  }
  return undefined;
}

describe('card validation', () => {
  it.each([
    ['4242424242424242', true],
    ['4242424242424241', false],
    ['5555555555554444', true],
    ['378282246310005', true],
  ])('Luhn of %s is %s', (pan, ok) => {
    expect(luhnValid(pan)).toBe(ok);
  });

  it.each([
    ['4242424242424242', 'visa'],
    ['5555555555554444', 'mastercard'],
    ['2223003122003222', 'mastercard'],
    ['378282246310005', 'amex'],
    ['6362970000457013', 'elo'],
    ['4011780000000000', 'elo'], // Elo BIN inside the Visa range
    ['6062825624254001', 'hipercard'],
    ['6011111111111117', null], // Discover: not accepted
  ])('detects %s as %s', (pan, brand) => {
    expect(detectBrand(pan)).toBe(brand);
  });

  it('accepts spaces and dashes in the number', () => {
    expect(
      validateCard({ ...valid, number: '4242 4242-4242 4242' }, now),
    ).toEqual({
      pan: '4242424242424242',
      brand: 'visa',
    });
  });

  it('accepts a card expiring this month', () => {
    expect(() =>
      validateCard({ ...valid, expMonth: 10, expYear: 2026 }, now),
    ).not.toThrow();
  });

  it.each([
    [
      'a bad check digit',
      { number: '4242424242424241' },
      'vault.invalid_number',
    ],
    ['too few digits', { number: '42424242' }, 'vault.invalid_number'],
    [
      'an unaccepted brand',
      { number: '6011111111111117' },
      'vault.unsupported_brand',
    ],
    ['last month', { expMonth: 9, expYear: 2026 }, 'vault.expired_card'],
    ['an absurd expiry', { expYear: 2099 }, 'vault.invalid_expiry'],
    ['a 4-digit CVC on Visa', { cvc: '1234' }, 'vault.invalid_cvc'],
    [
      'a 3-digit CVC on Amex',
      { number: '378282246310005', cvc: '123' },
      'vault.invalid_cvc',
    ],
  ])('rejects %s', (_, override, code) => {
    expect(codeOf(() => validateCard({ ...valid, ...override }, now))).toBe(
      code,
    );
  });

  it('never repeats the card number in an error', () => {
    const number = '4242424242424241';
    try {
      validateCard({ ...valid, number }, now);
    } catch (error) {
      expect((error as Error).message).not.toContain(number);
      expect((error as Error).message).not.toContain(number.slice(-4));
    }
  });
});
