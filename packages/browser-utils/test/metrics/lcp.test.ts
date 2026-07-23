import { describe, expect, it } from 'vitest';
import { isValidLcpMetric, MAX_PLAUSIBLE_LCP_DURATION } from '../../src/metrics/lcp';

describe('isValidLcpMetric', () => {
  it('returns true for plausible lcp values', () => {
    expect(isValidLcpMetric(1)).toBe(true);
    expect(isValidLcpMetric(2_500)).toBe(true);
    expect(isValidLcpMetric(MAX_PLAUSIBLE_LCP_DURATION)).toBe(true);
  });

  it('returns false for implausible lcp values', () => {
    expect(isValidLcpMetric(undefined)).toBe(false);
    expect(isValidLcpMetric(0)).toBe(false);
    expect(isValidLcpMetric(-1)).toBe(false);
    expect(isValidLcpMetric(MAX_PLAUSIBLE_LCP_DURATION + 1)).toBe(false);
  });
});
