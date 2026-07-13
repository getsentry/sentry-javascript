import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getAbsoluteUrl } from '../../src/instrument/location';

describe('getAbsoluteUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      origin: 'https://sentry.io',
    });
  });

  it('returns the absolute URL when handed a relative URL', () => {
    expect(getAbsoluteUrl('/foo')).toBe('https://sentry.io/foo');
  });

  it('returns the original URL when handed a full URL', () => {
    expect(getAbsoluteUrl('https://santry.io/foo')).toBe('https://santry.io/foo');
  });

  it('returns query params', () => {
    expect(getAbsoluteUrl('/foo?bar=baz')).toBe('https://sentry.io/foo?bar=baz');
  });

  it('returns fragments', () => {
    expect(getAbsoluteUrl('/foo#bar')).toBe('https://sentry.io/foo#bar');
  });
});
