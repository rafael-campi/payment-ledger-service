import { MAX_ATTEMPTS, nextAttemptAt } from './retry-schedule';

describe('retry schedule', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  it('backs off after each failure', () => {
    expect(nextAttemptAt(1, now)).toEqual(new Date('2026-10-21T12:00:30Z'));
    expect(nextAttemptAt(2, now)).toEqual(new Date('2026-10-21T12:02:00Z'));
    expect(nextAttemptAt(8, now)).toEqual(new Date('2026-10-22T00:00:00Z'));
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts`, () => {
    expect(MAX_ATTEMPTS).toBe(9);
    expect(nextAttemptAt(MAX_ATTEMPTS, now)).toBeNull();
  });
});
