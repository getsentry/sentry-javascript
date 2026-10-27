/**
 * Every `at` Solid's runtime and attribution engine emit is on the
 * `performance.now()` clock; Sentry spans take epoch seconds.
 */
export function epochSeconds(perfNow: number): number {
  return (performance.timeOrigin + perfNow) / 1000;
}

export function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}
