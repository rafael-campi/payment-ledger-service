import { buildDynamicBrCode, crc16 } from './br-code';

// splits a TLV string into [id, value] pairs (top level only)
function parseTlv(payload: string): [string, string][] {
  const fields: [string, string][] = [];
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const length = Number(payload.slice(i + 2, i + 4));
    fields.push([id, payload.slice(i + 4, i + 4 + length)]);
    i += 4 + length;
  }
  return fields;
}

describe('BR Code', () => {
  it('computes CRC-16/CCITT-FALSE', () => {
    // standard check value for this CRC variant
    expect(crc16('123456789')).toBe('29B1');
  });

  const payload = buildDynamicBrCode({
    location: 'pix.simulator.local/qr/v2/abc123',
    amount: 12345,
    merchantName: 'Loja Prateleira São João Ltda',
    merchantCity: 'São Paulo',
  });

  it('ends with a CRC over everything before it', () => {
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('encodes a single-use dynamic charge in BRL', () => {
    const fields = Object.fromEntries(parseTlv(payload));

    expect(fields['00']).toBe('01');
    expect(fields['01']).toBe('12');
    expect(Object.fromEntries(parseTlv(fields['26']))).toEqual({
      '00': 'br.gov.bcb.pix',
      '25': 'pix.simulator.local/qr/v2/abc123',
    });
    expect(fields['53']).toBe('986');
    expect(fields['54']).toBe('123.45');
    expect(fields['58']).toBe('BR');
  });

  it('writes merchant name and city as short uppercase ASCII', () => {
    const fields = Object.fromEntries(parseTlv(payload));

    expect(fields['59']).toBe('LOJA PRATELEIRA SAO JOAO');
    expect(fields['60']).toBe('SAO PAULO');
  });
});
