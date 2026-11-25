import type { Client } from '@sentry/core';
import { setCurrentClient, withIsolationScope } from '@sentry/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import { addServerTimingTraceHeader } from '../../src/utils/serverTimingTraceHeader';
import { wrapServerRequestHandler } from '../../src/utils/wrapServerRequestHandler';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const TRACE_ID = '12312012123120121231201212312012';
const INCOMING_TRACE = `${TRACE_ID}-1121201211212012-1`;

function setup({ enabled = true, tracesSampleRate = 1 }: { enabled?: boolean; tracesSampleRate?: number } = {}): {
  client: Client;
  serve: (handler: () => Response | Promise<Response>, headers?: Record<string, string>) => Promise<Response>;
} {
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate,
      beforeSendTransaction: () => null,
    }),
  );
  setCurrentClient(client);
  client.init();
  if (enabled) {
    addServerTimingTraceHeader(client);
  }

  const serve = (
    handler: () => Response | Promise<Response>,
    headers: Record<string, string> = {},
  ): Promise<Response> =>
    withIsolationScope(isolationScope =>
      wrapServerRequestHandler(
        {
          request: new Request('https://example.com/user/5', { headers }),
          client,
          isolationScope,
          options: {},
          origin: 'auto.http.test',
        },
        handler,
      ),
    );
  return { client, serve };
}

const html = (init: ResponseInit = {}): Response =>
  new Response('<html></html>', { ...init, headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers } });

describe('addServerTimingTraceHeader', () => {
  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
  });

  it('adds the trace of the request to a document response', async () => {
    const { serve } = setup();

    const response = await serve(() => html(), { 'sentry-trace': INCOMING_TRACE });

    const value = response.headers.get('server-timing');
    expect(value).toMatch(new RegExp(`^sentry-trace;desc="${TRACE_ID}-[0-9a-f]{16}-1", baggage;desc=".*"$`));
  });

  it('adds the trace when tracing is off', async () => {
    const { serve } = setup({ tracesSampleRate: undefined as unknown as number });

    const response = await serve(() => html(), { 'sentry-trace': INCOMING_TRACE });

    expect(response.headers.get('server-timing')).toContain(`sentry-trace;desc="${TRACE_ID}-`);
  });

  it('does nothing for a client that did not turn it on', async () => {
    const { serve } = setup({ enabled: false });

    const response = await serve(() => html());

    expect(response.headers.get('server-timing')).toBeNull();
  });

  it('skips responses that are not documents', async () => {
    const { serve } = setup();

    const response = await serve(() => Response.json({ ok: true }));

    expect(response.headers.get('server-timing')).toBeNull();
  });

  it.each([
    ['Cache-Control: public, max-age=60', { 'cache-control': 'public, max-age=60' }],
    ['Cache-Control: s-maxage=60', { 'cache-control': 's-maxage=60' }],
    ['CDN-Cache-Control: max-age=60', { 'cdn-cache-control': 'max-age=60' }],
  ])('skips a document shared caches may store (%s)', async (_, headers) => {
    const { serve } = setup();

    const response = await serve(() => html({ headers }));

    expect(response.headers.get('server-timing')).toBeNull();
  });

  it('keeps entries of the app', async () => {
    const { serve } = setup();

    const response = await serve(() => html({ headers: { 'server-timing': 'db;dur=53' } }));

    expect(response.headers.get('server-timing')).toMatch(/^db;dur=53, sentry-trace;desc="/);
  });

  it('leaves a sentry-trace entry of the app alone', async () => {
    const { serve } = setup();

    const response = await serve(() => html({ headers: { 'server-timing': 'sentry-trace;desc="own"' } }));

    expect(response.headers.get('server-timing')).toBe('sentry-trace;desc="own"');
  });

  it('copies a response with immutable headers', async () => {
    const { serve } = setup();
    const original = html({ status: 201, statusText: 'Created' });
    Object.defineProperty(original.headers, 'set', {
      value: () => {
        throw new TypeError('immutable');
      },
    });

    const response = await serve(() => original);

    expect(response).not.toBe(original);
    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('server-timing')).toContain('sentry-trace;desc="');
    expect(await response.text()).toBe('<html></html>');
  });
});
