import { describe, expect, it } from 'vitest';
import { mergeBaggageHeaders } from '../../src/utils/baggage';

describe('mergeBaggageHeaders', () => {
  it('returns new baggage when existing is undefined', () => {
    const result = mergeBaggageHeaders(undefined, 'foo=bar');
    expect(result).toBe('foo=bar');
  });

  it('returns existing baggage when new baggage is empty', () => {
    const result = mergeBaggageHeaders('foo=bar', '');
    expect(result).toBe('foo=bar');
  });

  it('returns existing baggage when new baggage is invalid', () => {
    const result = mergeBaggageHeaders('foo=bar', 'invalid');
    expect(result).toBe('foo=bar');
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

    const entries = result?.split(',');
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
});
