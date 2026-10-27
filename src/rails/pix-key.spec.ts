import { DomainError } from '../shared/errors';
import { normalizePixKey } from './pix-key';

describe('normalizePixKey', () => {
  it.each([
    ['529.982.247-25', '52998224725'], // CPF
    ['11.222.333/0001-81', '11222333000181'], // CNPJ
    ['Loja@Prateleira.com.br', 'loja@prateleira.com.br'],
    ['+55 (11) 98765-4321', '+5511987654321'],
    [
      '7D9F0335-8DCC-4054-9BF9-0DBD61D36906',
      '7d9f0335-8dcc-4054-9bf9-0dbd61d36906',
    ],
  ])('accepts %s as %s', (raw, canonical) => {
    expect(normalizePixKey(raw)).toBe(canonical);
  });

  it.each([
    ['a CPF with a wrong check digit', '529.982.247-24'],
    ['a CPF of repeated digits', '111.111.111-11'],
    ['a CNPJ with a wrong check digit', '11.222.333/0001-82'],
    ['a phone without +55', '11987654321'],
    ['free text', 'minha chave'],
  ])('rejects %s', (_, raw) => {
    expect(() => normalizePixKey(raw)).toThrow(DomainError);
  });
});
