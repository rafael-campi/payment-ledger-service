import { computeFee } from './fees';

describe('computeFee', () => {
  it.each([
    [10000, 99, 99], // R$ 100,00 at 0.99%
    [12345, 99, 122], // 122.2155
    [50, 100, 1], // exactly half a cent rounds up
    [49, 100, 0],
    [10000, 0, 0],
    [10000, 10000, 10000],
    [1_000_000_000, 99, 9_900_000],
  ])('charges %i cents at %i bps → %i', (amount, bps, fee) => {
    expect(computeFee(amount, bps)).toBe(fee);
  });
});
