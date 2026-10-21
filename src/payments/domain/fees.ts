/** Fee in cents for a rate in basis points, rounded half up. Integer math only. */
export function computeFee(amount: number, bps: number): number {
  return Math.floor((amount * bps + 5000) / 10000);
}
