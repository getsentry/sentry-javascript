import { startSpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { canRecordSpan } from '../../src/utils/canRecordSpan';
import { initTestClient, resetSdk } from '../testUtils';

describe('canRecordSpan', () => {
  it('returns true when tracing is enabled and no span is active', () => {
    initTestClient();

    expect(canRecordSpan()).toBe(true);
  });

  it('returns true inside a sampled span', () => {
    initTestClient();

    startSpan({ name: 'parent' }, () => {
      expect(canRecordSpan()).toBe(true);
    });
  });

  it('returns false inside an unsampled span', () => {
    initTestClient({ tracesSampleRate: 0 });

    startSpan({ name: 'parent' }, () => {
      expect(canRecordSpan()).toBe(false);
    });
  });

  it.each([
    ['tracing is not configured', { tracesSampleRate: undefined }],
    ['the SDK is disabled', { enabled: false }],
    ['no DSN is set', { dsn: undefined }],
  ])('returns false when %s', (_label, options) => {
    initTestClient(options);

    expect(canRecordSpan()).toBe(false);
  });

  it('returns false when there is no client', () => {
    resetSdk();

    expect(canRecordSpan()).toBe(false);
  });
});
