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

  it('handles empty existing baggage', () => {
    const result = mergeBaggageHeaders('', 'foo=bar,sentry-release=1.0.0');
    expect(result).toBe('foo=bar,sentry-release=1.0.0');
  });

  it('preserves existing non-Sentry entries', () => {
    const result = mergeBaggageHeaders('foo=bar,other=vendor', 'foo=newvalue,third=party');

    const entries = result?.split(',');
    expect(entries).toContain('foo=bar');
    expect(entries).toContain('other=vendor');
    expect(entries).toContain('third=party');
    expect(entries).not.toContain('foo=newvalue');
  });

  it('overwrites existing Sentry entries with new ones', () => {
    const result = mergeBaggageHeaders(
      'sentry-release=1.0.0,sentry-environment=prod',
      'sentry-release=2.0.0,sentry-environment=staging',
    );

    const entries = result?.split(',');
    expect(entries).toContain('sentry-release=2.0.0');
    expect(entries).toContain('sentry-environment=staging');
    expect(entries).not.toContain('sentry-release=1.0.0');
    expect(entries).not.toContain('sentry-environment=prod');
  });

  it('merges Sentry and non-Sentry entries correctly', () => {
    const result = mergeBaggageHeaders('foo=bar,sentry-release=1.0.0,other=vendor', 'sentry-release=2.0.0,third=party');

    const entries = result?.split(',');
    expect(entries).toContain('foo=bar');
    expect(entries).toContain('other=vendor');
    expect(entries).toContain('third=party');
    expect(entries).toContain('sentry-release=2.0.0');
    expect(entries).not.toContain('sentry-release=1.0.0');
  });

  it('handles third-party baggage with Sentry entries', () => {
    const result = mergeBaggageHeaders(
      'other=vendor,foo=bar,third=party,sentry-release=9.9.9,sentry-environment=staging,sentry-sample_rate=0.54,last=item',
      'sentry-release=2.1.0,sentry-environment=myEnv',
    );

    const entries = result?.split(',');
    expect(entries).toContain('foo=bar');
    expect(entries).toContain('last=item');
    expect(entries).toContain('other=vendor');
    expect(entries).toContain('third=party');
    expect(entries).toContain('sentry-environment=myEnv');
    expect(entries).toContain('sentry-release=2.1.0');
    expect(entries).toContain('sentry-sample_rate=0.54');
    expect(entries).not.toContain('sentry-environment=staging');
    expect(entries).not.toContain('sentry-release=9.9.9');
  });

  it('adds new Sentry entries when they do not exist', () => {
    const result = mergeBaggageHeaders('foo=bar,other=vendor', 'sentry-release=1.0.0,sentry-environment=prod');

    const entries = result?.split(',');
    expect(entries).toContain('foo=bar');
    expect(entries).toContain('other=vendor');
    expect(entries).toContain('sentry-release=1.0.0');
    expect(entries).toContain('sentry-environment=prod');
  });

  it('handles array-type existing baggage', () => {
    const result = mergeBaggageHeaders(['foo=bar', 'other=vendor'], 'sentry-release=1.0.0');

    const entries = (result as string)?.split(',');
    expect(entries).toContain('foo=bar');
    expect(entries).toContain('other=vendor');
    expect(entries).toContain('sentry-release=1.0.0');
  });

  it('preserves order of existing entries', () => {
    const result = mergeBaggageHeaders('first=1,second=2,third=3', 'fourth=4');
    expect(result).toBe('first=1,second=2,third=3,fourth=4');
  });

  it('handles complex scenario with multiple Sentry keys', () => {
    const result = mergeBaggageHeaders(
      'foo=bar,sentry-release=old,sentry-environment=old,other=vendor',
      'sentry-release=new,sentry-environment=new,sentry-transaction=test,new=entry',
    );

    const entries = result?.split(',');
    expect(entries).toContain('foo=bar');
    expect(entries).toContain('other=vendor');
    expect(entries).toContain('sentry-release=new');
    expect(entries).toContain('sentry-environment=new');
    expect(entries).toContain('sentry-transaction=test');
    expect(entries).toContain('new=entry');
    expect(entries).not.toContain('sentry-release=old');
    expect(entries).not.toContain('sentry-environment=old');
  });

  it('matches OTEL propagation.inject() behavior for Sentry keys', () => {
    const result = mergeBaggageHeaders(
      'sentry-trace_id=abc123,sentry-sampled=false,non-sentry=keep',
      'sentry-trace_id=xyz789,sentry-sampled=true',
    );

    const entries = result?.split(',');
    expect(entries).toContain('sentry-trace_id=xyz789');
    expect(entries).toContain('sentry-sampled=true');
    expect(entries).toContain('non-sentry=keep');
    expect(entries).not.toContain('sentry-trace_id=abc123');
    expect(entries).not.toContain('sentry-sampled=false');
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
