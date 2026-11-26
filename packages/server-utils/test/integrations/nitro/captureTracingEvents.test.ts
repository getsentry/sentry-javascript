import { tracingChannel } from 'node:diagnostics_channel';
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HANDLER, HTTP_SERVER } from '@sentry/conventions/op';
import type { SpanJSON } from '@sentry/core';
import {
  createTransport,
  getActiveSpan,
  getCurrentScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../src/async-context';
import { captureTracingEvents } from '../../../src/integrations/nitro/captureTracingEvents';
import type { H3TracingRequestEvent } from '../../../src/integrations/nitro/nitroTypes';
import { TestClient } from '../../mocks/client';

const h3RequestChannel = tracingChannel<H3TracingRequestEvent>('h3.request');

function createH3Event(): H3TracingRequestEvent['event'] {
  return {
    url: new URL('https://shop.example.com/api/users/42?include=profile'),
    req: { method: 'GET' },
    context: { matchedRoute: { route: '/api/users/:id' }, params: { id: '42' } },
  };
}

/** Publishes an `h3.request` event like h3's `tracingPlugin`, and returns the span that is active inside it. */
function traceH3Request(type: H3TracingRequestEvent['type']): Promise<SpanJSON | undefined> {
  return startSpan({ name: 'GET /api/users/42', op: HTTP_SERVER }, () =>
    h3RequestChannel.tracePromise(
      async () => {
        const activeSpan = getActiveSpan();
        return activeSpan && spanToJSON(activeSpan);
      },
      { type, event: createH3Event() },
    ),
  );
}

// The subscribers stay on the process-wide channel, so a file can set them up only once.
// That is why `middleware: true` has no test here.
describe('captureTracingEvents with `middleware: false`', () => {
  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    initAndBind(TestClient, {
      dsn: 'https://username@domain/123',
      integrations: [],
      sendClientReports: false,
      stackParser: () => [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
    });

    captureTracingEvents({ middleware: false });
  });

  afterAll(() => {
    getCurrentScope().setClient(undefined);
    setAsyncContextStrategy(undefined);
  });

  it('starts no span for an h3 middleware', async () => {
    const activeSpan = await traceH3Request('middleware');

    expect(activeSpan?.name).toBe('GET /api/users/42');
    expect(activeSpan?.attributes[SENTRY_OP]).toBe(HTTP_SERVER);
  });

  it('still starts a handler span for an h3 route', async () => {
    const activeSpan = await traceH3Request('route');

    expect(activeSpan?.name).toBe('GET /api/users/:id');
    expect(activeSpan?.attributes[SENTRY_OP]).toBe(HANDLER);
    expect(activeSpan?.attributes[SENTRY_ORIGIN]).toBe('auto.http.nitro.h3');
  });
});
