import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTraceServerTimingHeader, isSharedCacheable } from '../../../src/utils/serverTiming';
import * as TraceDataModule from '../../../src/utils/traceData';

describe('getTraceServerTimingHeader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sentry-trace and baggage as Server-Timing entries', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    expect(getTraceServerTimingHeader()).toBe(
      'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=production"',
    );
  });

  it('leaves out baggage when the trace data has none', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: undefined,
    });

    expect(getTraceServerTimingHeader()).toBe(
      'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"',
    );
  });

  it('renders just the sentry-trace entry', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
    });

    expect(getTraceServerTimingHeader()).toBe(
      'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"',
    );
  });

  it('returns an empty string without trace data', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({});

    expect(getTraceServerTimingHeader()).toBe('');
  });

  it('uses provided traceData instead of calling getTraceData()', () => {
    const getTraceDataSpy = vi.spyOn(TraceDataModule, 'getTraceData');

    expect(
      getTraceServerTimingHeader({
        'sentry-trace': 'ab12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=staging',
      }),
    ).toBe(
      'sentry-trace;desc="ab12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=staging"',
    );
    expect(getTraceDataSpy).not.toHaveBeenCalled();
  });
});

describe('isSharedCacheable', () => {
  const withHeaders =
    (headers: Record<string, string>) =>
    (name: string): string | undefined =>
      headers[name];

  it.each([
    's-maxage=31536000',
    's-maxage=1, stale-while-revalidate=3599',
    'max-age=0, stale-while-revalidate=60',
    'max-age=0, stale-if-error=60',
    'public, max-age=31536000, immutable',
    'max-age=60',
  ])('reports a response a shared cache may store (%s)', cacheControl => {
    expect(isSharedCacheable(withHeaders({ 'cache-control': cacheControl }))).toBe(true);
  });

  it.each([
    'private, no-cache, no-store, max-age=0, must-revalidate',
    'no-store',
    'private, max-age=60',
    'private, s-maxage=60',
    's-maxage=0',
    'max-age=0',
    'max-age=0, stale-while-revalidate=0',
    'no-cache',
    '',
  ])('reports a response only the browser may store (%s)', cacheControl => {
    expect(isSharedCacheable(withHeaders({ 'cache-control': cacheControl }))).toBe(false);
  });

  it.each(['cdn-cache-control', 'cloudflare-cdn-cache-control', 'vercel-cdn-cache-control', 'surrogate-control'])(
    'reports a response a CDN stores on its own field (%s) even when Cache-Control forbids it',
    name => {
      expect(isSharedCacheable(withHeaders({ 'cache-control': 'private', [name]: 's-maxage=60' }))).toBe(true);
    },
  );

  it('falls back to Cache-Control when the CDN field forbids caching', () => {
    expect(
      isSharedCacheable(withHeaders({ 'cache-control': 'public, max-age=60', 'cdn-cache-control': 'no-store' })),
    ).toBe(true);
  });

  it('reads an uppercase value', () => {
    expect(isSharedCacheable(withHeaders({ 'cache-control': 'Public, Max-Age=60' }))).toBe(true);
  });

  it('falls back to a future Expires without a lifetime in Cache-Control', () => {
    expect(isSharedCacheable(withHeaders({ expires: new Date(Date.now() + 60_000).toUTCString() }))).toBe(true);
    expect(isSharedCacheable(withHeaders({ expires: new Date(Date.now() - 60_000).toUTCString() }))).toBe(false);
    expect(isSharedCacheable(withHeaders({ expires: 'not a date' }))).toBe(false);
  });

  it('lets a zero lifetime in Cache-Control override a future Expires', () => {
    expect(
      isSharedCacheable(
        withHeaders({ 'cache-control': 'max-age=0', expires: new Date(Date.now() + 60_000).toUTCString() }),
      ),
    ).toBe(false);
  });
});
