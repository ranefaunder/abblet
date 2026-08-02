/** Display defaults for Free / Premium (must match server env defaults). */
export const FREE_GRANT_USD = 0.99;
export const PREMIUM_GRANT_USD = 5.99;
export const PREMIUM_PRICE_USD = 5.99;

export function formatUsdAmount(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
