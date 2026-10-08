import type * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Trace data as the SDK would produce it for the active request; empty when nothing is active.
const getTraceData = vi.hoisted(() => vi.fn<() => { 'sentry-trace'?: string; baggage?: string }>(() => ({})));

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  getTraceData,
}));

import { sentryRemixMiddleware } from '../../src/v3/server/middleware';
import type { MatcherLike, RequestContextLike } from '../../src/v3/types';

/** A matcher that resolves every URL to the one pattern, or to nothing. */
function matcherFor(pattern: string | undefined): MatcherLike {
  return {
    add: () => {},
    matchAll: () => (pattern ? [{ data: { pattern: { source: pattern }, method: 'GET' }, params: {} }] : []),
  };
}

function contextFor(url: string, headers: Record<string, string> = {}): RequestContextLike {
  return { request: new Request(url, { headers }), url: new URL(url), method: 'GET', params: {} };
}

describe('sentryRemixMiddleware', () => {
  beforeEach(() => {
    getTraceData.mockReturnValue({});
  });

  it('propagates the trace to HTML responses through Server-Timing, ahead of the route', async () => {
    getTraceData.mockReturnValue({ 'sentry-trace': 'abc-def-1', baggage: 'sentry-trace_id=abc' });
    const middleware = sentryRemixMiddleware(matcherFor('/users/:id'));

    const response = await middleware(
      contextFor('http://x/users/1', { accept: 'text/html' }),
      async () => new Response(''),
    );

    expect(response.headers.get('server-timing')).toBe(
      'sentry-trace;desc="abc-def-1", baggage;desc="sentry-trace_id=abc", sentry-route;desc="/users/:id"',
    );
  });

  it('propagates the trace even when no route matched', async () => {
    getTraceData.mockReturnValue({ 'sentry-trace': 'abc-def-1' });
    const middleware = sentryRemixMiddleware(matcherFor(undefined));

    const response = await middleware(
      contextFor('http://x/nope', { accept: 'text/html' }),
      async () => new Response(''),
    );

    expect(response.headers.get('server-timing')).toBe('sentry-trace;desc="abc-def-1"');
  });

  it.each([
    ['public', 'public, max-age=60'],
    ['s-maxage', 's-maxage=300'],
    ['max-age', 'max-age=60'],
  ])('leaves the trace off a response a shared cache may store (%s), keeping the route', async (_why, cacheControl) => {
    getTraceData.mockReturnValue({ 'sentry-trace': 'abc-def-1', baggage: 'sentry-trace_id=abc' });
    const middleware = sentryRemixMiddleware(matcherFor('/'));

    const response = await middleware(
      contextFor('http://x/', { accept: 'text/html' }),
      async () => new Response('', { headers: { 'cache-control': cacheControl } }),
    );

    expect(response.headers.get('server-timing')).toBe('sentry-route;desc="/"');
  });

  it.each([
    ['private', 'private, max-age=60'],
    ['no-store', 'no-store'],
    ['max-age=0', 'max-age=0, must-revalidate'],
    ['s-maxage=0', 'max-age=3600, s-maxage=0'],
    ['no cache header', undefined],
  ])('propagates the trace on a response only this user can get back (%s)', async (_why, cacheControl) => {
    getTraceData.mockReturnValue({ 'sentry-trace': 'abc-def-1' });
    const middleware = sentryRemixMiddleware(matcherFor('/'));

    const response = await middleware(
      contextFor('http://x/', { accept: 'text/html' }),
      async () => new Response('', { headers: cacheControl ? { 'cache-control': cacheControl } : {} }),
    );

    expect(response.headers.get('server-timing')).toContain('sentry-trace;desc="abc-def-1"');
  });

  it('reports the route on HTML responses through Server-Timing', async () => {
    const middleware = sentryRemixMiddleware(matcherFor('/users/:id'));

    const response = await middleware(
      contextFor('http://x/users/12345', { accept: 'text/html' }),
      async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
    );

    expect(response.headers.get('server-timing')).toBe('sentry-route;desc="/users/:id"');
  });

  it('quotes a pattern that contains header-breaking characters', async () => {
    const middleware = sentryRemixMiddleware(matcherFor('/files/:name("a\\b")'));

    const response = await middleware(
      contextFor('http://x/files/x', { accept: 'text/html' }),
      async () => new Response(''),
    );

    expect(response.headers.get('server-timing')).toBe('sentry-route;desc="/files/:name(\\"a\\\\b\\")"');
  });

  it('keeps an existing Server-Timing header', async () => {
    const middleware = sentryRemixMiddleware(matcherFor('/'));

    const response = await middleware(
      contextFor('http://x/', { accept: 'text/html' }),
      async () => new Response('', { headers: { 'server-timing': 'db;dur=5' } }),
    );

    expect(response.headers.get('server-timing')).toBe('db;dur=5, sentry-route;desc="/"');
  });

  it('adds nothing to a response the browser did not ask for as a document', async () => {
    const middleware = sentryRemixMiddleware(matcherFor('/api/items/:itemId'));

    const response = await middleware(
      contextFor('http://x/api/items/1', { accept: 'application/json' }),
      async () => new Response('{}'),
    );

    expect(response.headers.has('server-timing')).toBe(false);
  });

  it('adds nothing when no route matched and no trace is active', async () => {
    const middleware = sentryRemixMiddleware(matcherFor(undefined));

    const response = await middleware(
      contextFor('http://x/nope', { accept: 'text/html' }),
      async () => new Response('Not Found', { status: 404 }),
    );

    expect(response.headers.has('server-timing')).toBe(false);
  });

  it('leaves a response with immutable headers alone, without failing the request', async () => {
    const middleware = sentryRemixMiddleware(matcherFor('/'));

    // `Response.error()` is the one constructor that yields immutable headers, like a passed through
    // `fetch()` response does.
    const response = await middleware(contextFor('http://x/', { accept: 'text/html' }), async () => Response.error());

    expect(response.headers.has('server-timing')).toBe(false);
  });
});
