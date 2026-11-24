import { tracingChannel } from 'node:diagnostics_channel';
import { HTTP_ROUTE, SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { getCurrentScope, GLOBAL_OBJ, setCurrentClient, spanToJSON, spanToTraceHeader, startSpan } from '@sentry/core';
import { setIsNitroDevServer } from '@sentry/core/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { capturePrepareResponse } from '../../../src/integrations/nitro/capturePrepareResponse';
import type { NitroH3Event } from '../../../src/integrations/nitro/nitroTypes';
import { nitroChannels } from '../../../src/orchestrion/config/nitro';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const prepareResponseChannel = tracingChannel(nitroChannels.H3_PREPARE_RESPONSE);

function createEvent(context: NitroH3Event['context']): NitroH3Event & { res: { headers: Headers } } {
  return {
    url: { href: 'https://shop.example.com/api/users/42?include=orders' },
    req: { method: 'GET' },
    res: { headers: new Headers() },
    context,
  };
}

function prepareResponse(event: NitroH3Event, nested?: boolean, val: unknown = { id: 42 }): void {
  prepareResponseChannel.traceSync(() => undefined, { arguments: [val, event, {}, nested] });
}

function inHttpServerSpan(callback: () => void): Span {
  return startSpan(
    { name: 'GET /api/users/42', attributes: { [SENTRY_OP]: 'http.server', 'http.request.method': 'GET' } },
    span => {
      callback();
      return span;
    },
  );
}

describe('capturePrepareResponse', () => {
  beforeAll(() => {
    capturePrepareResponse(true);
  });

  beforeEach(() => {
    getCurrentScope().setClient(undefined);
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    delete (GLOBAL_OBJ as { __SENTRY_NITRO_DEV_SERVER__?: boolean }).__SENTRY_NITRO_DEV_SERVER__;
  });

  it('names the http.server root span after the matched route', () => {
    const event = createEvent({ matchedRoute: { route: '/api/users/:id' }, params: { id: '42' } });

    const rootSpan = inHttpServerSpan(() => prepareResponse(event));

    const { name, attributes } = spanToJSON(rootSpan);
    expect(name).toBe('GET /api/users/:id');
    expect(attributes[HTTP_ROUTE]).toBe('/api/users/:id');
    expect(attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
    expect(attributes['url.path.parameter.id']).toBe('42');
  });

  it('keeps the name of the root span for the `/**` catch-all route', () => {
    const event = createEvent({ matchedRoute: { route: '/**' } });

    const rootSpan = inHttpServerSpan(() => prepareResponse(event));

    expect(spanToJSON(rootSpan).name).toBe('GET /api/users/42');
    expect(spanToJSON(rootSpan).attributes[HTTP_ROUTE]).toBeUndefined();
  });

  it('sets the Server-Timing headers of the active trace', () => {
    const event = createEvent({ matchedRoute: { route: '/api/users/:id' } });

    const rootSpan = inHttpServerSpan(() => prepareResponse(event));

    expect(event.res.headers.get('Server-Timing')).toMatch(
      new RegExp(`^sentry-trace;desc="${spanToTraceHeader(rootSpan)}", baggage;desc=".+"$`),
    );
  });

  it('sets the Server-Timing headers once when `prepareResponse` runs again on the error path', () => {
    const event = createEvent({ matchedRoute: { route: '/api/users/:id' } });

    inHttpServerSpan(() => {
      prepareResponse(event);
      prepareResponse(event, true);
    });

    expect(event.res.headers.get('Server-Timing')?.match(/sentry-trace;/g)).toHaveLength(1);
    expect(event.res.headers.get('Server-Timing')?.match(/baggage;/g)).toHaveLength(1);
  });

  it('skips the Server-Timing headers that the native `h3.request` path already set', () => {
    const event = createEvent({ matchedRoute: { route: '/api/users/:id' }, _sentryServerTimingSet: true });

    inHttpServerSpan(() => prepareResponse(event));

    expect(event.res.headers.get('Server-Timing')).toBeNull();
  });

  it.each([{ cache: { swr: true } }, { isr: true }, { prerender: true }])(
    'skips the Server-Timing headers for a response that the %o route rule caches',
    routeRules => {
      const event = createEvent({ matchedRoute: { route: '/api/users/:id' }, routeRules });

      inHttpServerSpan(() => prepareResponse(event));

      expect(event.res.headers.get('Server-Timing')).toBeNull();
    },
  );

  it('skips the Server-Timing headers for a response that a shared cache may store', () => {
    const event = createEvent({ matchedRoute: { route: '/api/users/:id' } });
    const response = new Response('{}', { headers: { 'cache-control': 'public, max-age=60' } });

    inHttpServerSpan(() => prepareResponse(event, undefined, response));

    expect(event.res.headers.get('Server-Timing')).toBeNull();
  });

  it("leaves the dev server's responses to the worker it passes the requests on to", () => {
    setIsNitroDevServer();
    const event = createEvent({ matchedRoute: { route: '/api/users/:id' } });

    const rootSpan = inHttpServerSpan(() => prepareResponse(event));

    expect(spanToJSON(rootSpan).name).toBe('GET /api/users/42');
    expect(event.res.headers.get('Server-Timing')).toBeNull();
  });
});
