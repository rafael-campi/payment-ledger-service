import { DomainError } from '../shared/errors';

/**
 * A Pix key as the DICT accepts it: CPF, CNPJ, e-mail, phone (+55...) or a
 * random key (EVP). Returns the canonical form or throws.
 */
export function normalizePixKey(raw: string): string {
  const key = raw.trim();
  const digits = key.replace(/\D/g, '');

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  ) {
    return key.toLowerCase(); // EVP
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) && key.length <= 77) {
    return key.toLowerCase();
  }
  if (/^\+55\d{10,11}$/.test(key.replace(/[\s()-]/g, ''))) {
    return key.replace(/[\s()-]/g, '');
  }
  if (/^[\d.-]+$/.test(key) && digits.length === 11 && validCpf(digits)) {
    return digits;
  }
  if (/^[\d./-]+$/.test(key) && digits.length === 14 && validCnpj(digits)) {
    return digits;
  }
  throw new DomainError(
    'settlement.invalid_pix_key',
    'The payout key must be a CPF, CNPJ, e-mail, +55 phone or random Pix key.',
  );
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function validCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const first = checkDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cpf[9]) && second === Number(cpf[10]);
}

function validCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const first = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}
