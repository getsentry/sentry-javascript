import { startSpan } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { isInUnsampledSpan } from '../../src/utils/isInUnsampledSpan';
import { initTestClient, resetSdk } from '../testUtils';

describe('isInUnsampledSpan', () => {
  afterEach(() => {
    resetSdk();
  });

  it('returns false when there is no active span', () => {
    initTestClient({ tracesSampleRate: 0 });

    expect(isInUnsampledSpan()).toBe(false);
  });

  it('returns false inside a sampled span', () => {
    initTestClient({ tracesSampleRate: 1 });

    startSpan({ name: 'parent' }, () => {
      expect(isInUnsampledSpan()).toBe(false);
    });
  });

  it('returns true inside an unsampled span', () => {
    initTestClient({ tracesSampleRate: 0 });

    startSpan({ name: 'parent' }, () => {
      expect(isInUnsampledSpan()).toBe(true);
    });
  });
});
