/**
 * 60 seconds is the maximum for a plausible LCP value.
 */
export const MAX_PLAUSIBLE_LCP_DURATION = 60_000;

export function isValidLcpMetric(lcpValue: number | undefined): lcpValue is number {
  return lcpValue != null && lcpValue > 0 && lcpValue <= MAX_PLAUSIBLE_LCP_DURATION;
}
