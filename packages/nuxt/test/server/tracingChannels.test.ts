/** @vitest-environment node */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE, HANDLER, HTTP_SERVER, MIDDLEWARE } from '@sentry/conventions/op';
import type { Client, SpanJSON } from '@sentry/core';
import { createTransport, getCurrentScope, spanToJSON, startNewTrace, startSpan } from '@sentry/core';
import { defineHandler, H3 } from 'nitro/h3';
import type { Driver, Storage } from 'unstorage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { wrapMiddlewareHandlerWithSentry } from '../../src/runtime/hooks/wrapMiddlewareHandler';
import { createStoragePlugin } from '../../src/runtime/utils/instrumentStorage';
import { init } from '../../src/server';

type TestStorage = Pick<Storage, 'mount' | 'setItem' | 'getItem' | 'removeItem'>;

/**
 * Imports from the `h3` and `unstorage` versions of the installed Nitro v3, which publish the tracing channels.
 * The `h3` and `unstorage` dependencies of this package are the Nitro v2 versions. Nothing checks `TModule`.
 */
const nitroRequire = createRequire(createRequire(import.meta.url).resolve('nitro/package.json'));
function importFromNitro<TModule>(specifier: string): Promise<TModule> {
  return import(pathToFileURL(nitroRequire.resolve(specifier)).href);
}

interface SpanSummary {
  op: unknown;
  name: string;
  origin: unknown;
  parentOp: unknown;
}

function summarize(span: SpanJSON, spans: SpanJSON[]): SpanSummary {
  const parent = spans.find(candidate => candidate.span_id === span.parent_span_id);
  return {
    op: span.attributes[SENTRY_OP],
    name: span.name,
    origin: span.attributes[SENTRY_ORIGIN],
    parentOp: parent?.attributes[SENTRY_OP],
  };
}

// Like a Nuxt app on Nitro v3 with `tracingChannel: true`.
// The subscribers stay on the process-wide channels, so all tests share one client.
describe('Nuxt server SDK with the Nitro v3 tracing channels on', () => {
  let client: Client;
  let app: H3;
  const endedSpans: SpanJSON[] = [];

  /** Makes the `http.server` root span, as the HTTP integration of the runtime does in a real server. */
  async function request(path: string): Promise<{ response: Response; spans: SpanSummary[] }> {
    const { response, traceId } = await startNewTrace(() =>
      startSpan({ name: 'GET', op: HTTP_SERVER }, async rootSpan => ({
        response: await app.request(path),
        traceId: spanToJSON(rootSpan).trace_id,
      })),
    );

    const spans = endedSpans.filter(span => span.trace_id === traceId);
    return { response, spans: spans.map(span => summarize(span, spans)) };
  }

  beforeAll(async () => {
    const { tracingPlugin } = await importFromNitro<{ tracingPlugin: () => (app: H3) => void }>('h3/tracing');
    const { createStorage } = await importFromNitro<{ createStorage: () => TestStorage }>('unstorage');
    const { default: memoryDriver } = await importFromNitro<{ default: () => Driver }>('unstorage/drivers/memory');
    const { withTracing } = await importFromNitro<{ withTracing: (storage: TestStorage) => TestStorage }>(
      'unstorage/tracing',
    );

    const nuxtClient = init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => Promise.resolve({})),
    });
    if (!nuxtClient) {
      throw new Error('The Nuxt server SDK did not initialize.');
    }
    client = nuxtClient;
    client.on('spanEnd', span => endedSpans.push(spanToJSON(span)));

    const storage = createStorage();
    storage.mount('sessions', memoryDriver());
    createStoragePlugin(() => storage, ['sessions']);
    const tracedStorage = withTracing(storage);

    app = new H3();
    tracingPlugin()(app);
    app.use(defineHandler(wrapMiddlewareHandlerWithSentry(() => undefined, 'auth')));
    app.get('/api/sessions/:id', async event => {
      const key = `sessions:${event.context.params?.id}`;
      await tracedStorage.setItem(key, { user: 'ada' });
      const session = await tracedStorage.getItem(key);
      await tracedStorage.removeItem(key);
      return { session };
    });
  });

  afterAll(async () => {
    await client.close();
    getCurrentScope().setClient(undefined);
  });

  it('creates one span for a server middleware, from the SDK wrapper', async () => {
    const { spans } = await request('/api/sessions/42?include=profile');

    expect(spans.filter(span => span.op === MIDDLEWARE)).toEqual([
      { op: MIDDLEWARE, name: 'auth', origin: 'auto.middleware.nuxt', parentOp: HTTP_SERVER },
    ]);
  });

  it('creates one span for each storage call, from the SDK storage instrumentation', async () => {
    const { spans } = await request('/api/sessions/42?include=profile');

    expect(spans.filter(span => String(span.op).startsWith('cache.'))).toEqual([
      { op: CACHE_PUT, name: CACHE_PUT, origin: 'auto.cache.nuxt', parentOp: HANDLER },
      { op: CACHE_GET, name: CACHE_GET, origin: 'auto.cache.nuxt', parentOp: HANDLER },
      { op: CACHE_REMOVE, name: CACHE_REMOVE, origin: 'auto.cache.nuxt', parentOp: HANDLER },
    ]);
  });

  it('keeps the handler span of the h3 channel, which has no SDK source', async () => {
    const { spans } = await request('/api/sessions/42?include=profile');

    expect(spans.filter(span => span.op === HANDLER)).toEqual([
      { op: HANDLER, name: 'GET /api/sessions/:id', origin: 'auto.http.nitro.h3', parentOp: HTTP_SERVER },
    ]);
  });

  it('sets no Server-Timing header on the response', async () => {
    const { response } = await request('/api/sessions/42?include=profile');

    expect(response.status).toBe(200);
    expect(response.headers.get('Server-Timing')).toBeNull();
  });
});
