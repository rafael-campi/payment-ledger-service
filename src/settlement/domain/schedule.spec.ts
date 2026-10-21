import { releaseSchedule } from './schedule';

const at = new Date('2026-10-21T12:00:00Z');
const days = (n: number) => new Date(at.getTime() + n * 24 * 3600_000);

describe('releaseSchedule', () => {
  it('releases Pix the same day (D+0)', () => {
    expect(
      releaseSchedule({ net: 9901, method: 'pix', installments: 1, at }),
    ).toEqual([{ installment: 1, amount: 9901, availableOn: at }]);
  });

  it('releases each card installment 30 days apart, summing exactly', () => {
    const parts = releaseSchedule({
      net: 9701,
      method: 'credit_card',
      installments: 3,
      at,
    });

    expect(parts).toEqual([
      { installment: 1, amount: 3235, availableOn: days(30) },
      { installment: 2, amount: 3233, availableOn: days(60) },
      { installment: 3, amount: 3233, availableOn: days(90) },
    ]);
    expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBe(9701);
  });

  it('schedules nothing when the fee takes it all', () => {
    expect(
      releaseSchedule({ net: 0, method: 'pix', installments: 1, at }),
    ).toEqual([]);
    expect(
      releaseSchedule({ net: 2, method: 'credit_card', installments: 3, at }),
    ).toHaveLength(1);
  });
});
