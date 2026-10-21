import { DomainError } from '../../shared/errors';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard';

export type CardInput = {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  holderName?: string;
};

// Elo shares prefixes with Visa (4...) and must be checked first. Main BIN
// ranges published by Elo; a real PSP gets the full table from its acquirer.
const ELO_RANGES: [number, number][] = [
  [401178, 401179],
  [431274, 431274],
  [438935, 438935],
  [451416, 451416],
  [457393, 457393],
  [457631, 457632],
  [504175, 504175],
  [506699, 506778],
  [509000, 509999],
  [627780, 627780],
  [636297, 636297],
  [636368, 636368],
  [650031, 650033],
  [650035, 650051],
  [650405, 650439],
  [650485, 650538],
  [650541, 650598],
  [650700, 650718],
  [650720, 650727],
  [650901, 650920],
  [651652, 651679],
  [655000, 655019],
  [655021, 655058],
];
const HIPERCARD_PREFIXES = ['606282', '384100', '384140', '384160'];

export function detectBrand(pan: string): CardBrand | null {
  const bin = Number(pan.slice(0, 6));
  if (ELO_RANGES.some(([from, to]) => bin >= from && bin <= to)) return 'elo';
  if (HIPERCARD_PREFIXES.some((p) => pan.startsWith(p))) return 'hipercard';
  if (/^3[47]/.test(pan)) return 'amex';
  const two = Number(pan.slice(0, 2));
  const four = Number(pan.slice(0, 4));
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) {
    return 'mastercard';
  }
  if (pan.startsWith('4')) return 'visa';
  return null;
}

export function luhnValid(pan: string): boolean {
  let sum = 0;
  for (let i = 0; i < pan.length; i++) {
    let digit = Number(pan[pan.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Checks a card before it enters the vault. Error messages never repeat the
 * number: they end up in responses and logs.
 */
export function validateCard(
  input: CardInput,
  now: Date,
): { pan: string; brand: CardBrand } {
  const pan = input.number.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(pan) || !luhnValid(pan)) {
    throw new DomainError(
      'vault.invalid_number',
      'The card number is invalid.',
    );
  }
  const brand = detectBrand(pan);
  if (!brand) {
    throw new DomainError(
      'vault.unsupported_brand',
      'Only Visa, Mastercard, Elo, Hipercard and American Express are accepted.',
    );
  }

  const current = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  const expiry = input.expYear * 12 + input.expMonth;
  if (expiry < current) {
    throw new DomainError('vault.expired_card', 'The card has expired.');
  }
  if (expiry > current + 20 * 12) {
    throw new DomainError(
      'vault.invalid_expiry',
      'The expiry date is invalid.',
    );
  }

  const cvcLength = brand === 'amex' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(input.cvc)) {
    throw new DomainError(
      'vault.invalid_cvc',
      `The security code must have ${cvcLength} digits.`,
    );
  }
  return { pan, brand };
}
