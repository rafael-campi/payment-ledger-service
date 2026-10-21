import { generateEndToEndId, generateTxid } from './identifiers';

describe('Pix identifiers', () => {
  it('generates txids the BCB accepts, never repeating', () => {
    const txids = new Set(Array.from({ length: 1000 }, generateTxid));

    expect(txids.size).toBe(1000);
    for (const txid of txids) expect(txid).toMatch(/^[a-zA-Z0-9]{26,35}$/);
  });

  it('generates 32-character endToEndIds with ISPB and UTC timestamp', () => {
    const id = generateEndToEndId('99999999', new Date('2026-10-21T13:05:59Z'));

    expect(id).toMatch(/^E99999999202610211305[a-zA-Z0-9]{11}$/);
  });
});
