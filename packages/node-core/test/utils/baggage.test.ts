import { describe, expect, it } from 'vitest';
import { hasSentryBaggageValues, mergeBaggageHeaders } from '../../src/utils/baggage';

describe('hasSentryBaggageValues', () => {
  it('returns true for baggage with sentry- prefix', () => {
    const baggage = 'sentry-environment=production,sentry-public_key=abc123';
    expect(hasSentryBaggageValues(baggage)).toBe(true);
  });

  it('returns true for baggage with mixed sentry and non-sentry values', () => {
    const baggage = 'custom-key=value,sentry-trace_id=123,another-key=foo';
    expect(hasSentryBaggageValues(baggage)).toBe(true);
  });

  it('returns false for baggage without sentry values', () => {
    const baggage = 'custom-key=value,another-key=foo';
    expect(hasSentryBaggageValues(baggage)).toBe(false);
  });

  it('returns false for empty baggage', () => {
    expect(hasSentryBaggageValues('')).toBe(false);
  });

  it('returns false for undefined baggage', () => {
    expect(hasSentryBaggageValues(undefined)).toBe(false);
  });

  it('handles array of baggage headers', () => {
    const baggage = ['custom-key=value', 'sentry-environment=production'];
    expect(hasSentryBaggageValues(baggage)).toBe(true);
  });

  it('returns false for array without sentry values', () => {
    const baggage = ['custom-key=value', 'another-key=foo'];
    expect(hasSentryBaggageValues(baggage)).toBe(false);
  });

  it('handles baggage with whitespace', () => {
    const baggage = 'custom-key=value, sentry-environment=production , another-key=foo';
    expect(hasSentryBaggageValues(baggage)).toBe(true);
  });

  it('handles single sentry entry', () => {
    const baggage = 'sentry-trace_id=abc123';
    expect(hasSentryBaggageValues(baggage)).toBe(true);
  });

  it('is case-sensitive (does not match Sentry- or SENTRY-)', () => {
    const baggage = 'Sentry-environment=production,SENTRY-trace=123';
    expect(hasSentryBaggageValues(baggage)).toBe(false);
  });
});

describe('mergeBaggageHeaders', () => {
  it('returns new baggage when existing is undefined', () => {
    const result = mergeBaggageHeaders(undefined, 'sentry-environment=production');
    expect(result).toBe('sentry-environment=production');
  });

  it('returns existing baggage when new baggage is invalid', () => {
    const existing = 'custom-key=value';
    const result = mergeBaggageHeaders(existing, '');
    expect(result).toBe(existing);
  });

  it('merges non-conflicting baggage entries', () => {
    const existing = 'custom-key=value';
    const newBaggage = 'sentry-environment=production';
    const result = mergeBaggageHeaders(existing, newBaggage);
    expect(result).toContain('custom-key=value');
    expect(result).toContain('sentry-environment=production');
  });

  it('preserves existing entries when keys conflict', () => {
    const existing = 'sentry-environment=staging';
    const newBaggage = 'sentry-environment=production';
    const result = mergeBaggageHeaders(existing, newBaggage);
    expect(result).toBe('sentry-environment=staging');
  });

  it('handles multiple entries with conflicts', () => {
    const existing = 'custom-key=value1,sentry-environment=staging';
    const newBaggage = 'sentry-environment=production,sentry-trace_id=123';
    const result = mergeBaggageHeaders(existing, newBaggage);
    expect(result).toContain('custom-key=value1');
    expect(result).toContain('sentry-environment=staging');
    expect(result).toContain('sentry-trace_id=123');
    expect(result).not.toContain('sentry-environment=production');
  });
});
