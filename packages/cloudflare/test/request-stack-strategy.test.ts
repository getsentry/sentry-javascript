// This file sets no async context strategy, so the SDK uses the stack fallback, as on runtimes
// without `AsyncLocalStorage` (for example Shopify Oxygen, or Workers without `nodejs_compat`).

import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { expect, test, vi } from 'vitest';
import { httpServerIntegration, wrapRequestHandler } from '../src/request';

test('attaches the request data and body to events captured in the handler without AsyncLocalStorage', async () => {
  let event: Event | undefined;
  const body = JSON.stringify({ payload: 'x'.repeat(4_000) });

  await wrapRequestHandler(
    {
      options: {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        cacheClient: false,
        integrations: [httpServerIntegration({ maxRequestBodySize: 'small' })],
        beforeSend(captured) {
          event = captured;
          return null;
        },
      },
      request: new Request('https://example.com/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
      context: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as never,
    },
    () => {
      SentryCore.captureException(new Error('Action Error'));
      return new Response('error', { status: 500 });
    },
  );

  expect(event?.request).toEqual(
    expect.objectContaining({
      method: 'POST',
      url: 'https://example.com/action',
      // `maxRequestBodySize: 'small'` truncates at 1,000 bytes.
      data: `${body.slice(0, 997)}...`,
    }),
  );
});
