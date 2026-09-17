import { AsyncLocalStorage } from 'node:async_hooks';
import type { Event, StreamedSpanJSON } from '@sentry/core';
import {
  createTransport,
  getCurrentScope,
  setCurrentClient,
  spanStreamingIntegration,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { NodeClient } from '@sentry/node';
import type { RequestEvent } from '@solidjs/web';
import { createRequestEvent, getTraceContext, Loading, renderToStream } from '@solidjs/web';
import { OBSERVE, createComponent, createMemo } from 'solid-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { solidServerTracingIntegration } from '../../src/server';

// The runtime finds the request scope on this storage — what a host wires up.
const RequestContext = Symbol.for('solid.RequestContext');
let storage: AsyncLocalStorage<RequestEvent>;
beforeAll(() => {
  storage = new AsyncLocalStorage();
  (globalThis as Record<symbol, unknown>)[RequestContext] = storage;
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, RequestContext);
});

interface Captured {
  events: Event[];
  spans: StreamedSpanJSON[];
}

function clientWith(): { client: NodeClient; captured: Captured } {
  const captured: Captured = { events: [], spans: [] };
  const client = new NodeClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1,
    integrations: [spanStreamingIntegration(), solidServerTracingIntegration()],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    beforeSend: event => {
      captured.events.push(event);
      return null;
    },
    beforeSendSpan: span => {
      captured.spans.push(span);
      return span;
    },
  });
  setCurrentClient(client);
  client.init();
  return { client, captured };
}

function stream(code: () => unknown): Promise<string> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    renderToStream(code).pipe({
      write(chunk: string) {
        chunks.push(chunk);
      },
      end() {
        resolve(chunks.join(''));
      },
    });
  });
}

const inRequest = <T>(fn: () => T): T =>
  storage.run(createRequestEvent(new Request('https://app.example/users/42')), fn);

describe('solidServerTracingIntegration', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('runs against the observe build of solid-js', () => {
    expect(OBSERVE).toBeDefined();
  });

  it("answers the runtime's trace provider from the active span, sentry-trace and baggage included", () => {
    clientWith();
    const { ctx, span } = inRequest(() =>
      startSpan({ name: 'GET /users/:id', op: 'http.server' }, span => ({
        ctx: getTraceContext()!,
        span: spanToJSON(span),
      })),
    );
    expect(ctx.traceId).toBe(span.trace_id);
    expect(ctx.spanId).toBe(span.span_id);
    expect(ctx.sampled).toBe(true);
    expect(ctx.entries['sentry-trace']).toBe(`${span.trace_id}-${span.span_id}-1`);
    expect(ctx.entries.baggage).toContain(`sentry-trace_id=${span.trace_id}`);
    // The runtime's own W3C entry follows Sentry's ids.
    expect(ctx.entries.traceparent).toBe(`00-${span.trace_id}-${span.span_id}-01`);
  });

  it('server-function executions are spans; a failed one captures the error as thrown, unhandled', async () => {
    const { client, captured } = clientWith();
    const boom = new Error('connect ECONNREFUSED postgres://app:hunter2@db');
    const at = performance.now();
    OBSERVE!.records.emit(
      'invocation',
      { id: 'loadFeed', direct: false, at, durationMs: 22, outcome: 'ok' },
      { event: {} as never, args: [] },
    );
    OBSERVE!.records.emit(
      'invocation',
      { id: 'saveTodo', direct: true, at, durationMs: 3, outcome: 'error', boundary: '0-1', deferred: true },
      { event: {} as never, args: [1], error: boom },
    );
    await client.flush(100);

    const spans = captured.spans.filter(span => span.name === 'loadFeed' || span.name === 'saveTodo');
    expect(spans).toHaveLength(2);
    expect(spans.find(span => span.name === 'loadFeed')?.attributes).toMatchObject({
      'sentry.op': 'function.solid.rpc',
      'solid.server_function.direct': false,
      'solid.server_function.outcome': 'ok',
      'sentry.origin': 'auto.function.solid.server',
    });
    const failed = spans.find(span => span.name === 'saveTodo')!;
    expect(failed.status).toBe('error');
    expect(failed.attributes).toMatchObject({
      'sentry.op': 'function.solid.direct',
      'solid.server_function.boundary': '0-1',
      'solid.server_function.deferred': true,
    });
    expect(captured.events[0]?.exception?.values?.[0]).toMatchObject({
      value: 'connect ECONNREFUSED postgres://app:hunter2@db',
      mechanism: { type: 'auto.function.solid.server_function', handled: false },
    });
  });

  it('a produced frame stream is a span with its census; the client half is left to the browser', async () => {
    const { client, captured } = clientWith();
    const base = { version: 1, chunks: 7, fragments: 3, slots: 2, regions: 1, errors: 0, durationMs: 18 };
    OBSERVE!.records.emit(
      'frame',
      { ...base, side: 'server', id: 'Comments', at: performance.now(), shellMs: 2, outcome: 'complete' },
      {},
    );
    OBSERVE!.records.emit(
      'frame',
      { ...base, side: 'client', id: 'Comments', at: performance.now(), outcome: 'complete' },
      { response: new Response('') },
    );
    await client.flush(100);

    const frames = captured.spans.filter(span => span.attributes['sentry.op'] === 'solid.frame.produce');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.attributes).toMatchObject({
      'solid.frame.id': 'Comments',
      'solid.frame.regions': 1,
      'solid.frame.shellMs': 2,
      'sentry.origin': 'auto.function.solid.server',
    });
    expect(captured.spans.some(span => span.attributes['sentry.op'] === 'solid.frame.apply')).toBe(false);
  });

  it("a server finding's extras carry its data without the thrown error itself", async () => {
    const { client, captured } = clientWith();
    const boom = new Error('secret detail');
    OBSERVE!.diagnostics.emit(
      {
        code: 'SSR_RENDER_ERROR_CONTAINED',
        kind: 'ssr',
        severity: 'error',
        message: '[SSR_RENDER_ERROR_CONTAINED] Render error caught by <Errored>: Error: secret detail',
        ownerPath: ['<App>', '<Errored>', '<Bad>'],
        data: { handling: 'fallback', boundary: '0', boundaryPath: ['<App>', '<Errored>'], error: boom },
      },
      null,
    );
    await client.flush(100);

    const issue = captured.events.find(event => event.tags?.['solid.code'] === 'SSR_RENDER_ERROR_CONTAINED');
    expect(issue).toBeDefined();
    expect(issue!.fingerprint).toEqual(['SSR_RENDER_ERROR_CONTAINED', '<App>', '<Errored>', '<Bad>']);
    expect(issue!.extra).toMatchObject({ handling: 'fallback', boundary: '0', boundaryPath: ['<App>', '<Errored>'] });
    expect(issue!.extra).not.toHaveProperty('error');
  });

  it('a <Loading> boundary that waited during the render becomes a span', async () => {
    const { client, captured } = clientWith();
    let release!: (value: string) => void;
    const data = new Promise<string>(resolve => (release = resolve));

    const Slow = () => {
      const value = createMemo(() => data);
      return createMemo(() => value());
    };
    const App = () =>
      createComponent(
        Loading,
        {
          fallback: 'loading',
          get children() {
            return createComponent(Slow, {}, 'Slow');
          },
        },
        'Loading',
      );

    const html = inRequest(() => stream(() => createComponent(App, {}, 'App')));
    await new Promise(resolve => setTimeout(resolve, 5));
    release('ready');
    expect(await html).toContain('ready');
    await client.flush(100);

    const boundary = captured.spans.find(span => span.attributes['sentry.op'] === 'solid.boundary');
    expect(boundary).toBeDefined();
    expect(boundary).toMatchObject({
      name: '<App> › <Loading>',
      attributes: expect.objectContaining({
        'solid.boundary.outcome': 'settled',
        'solid.boundary.streamed': true,
        'sentry.origin': 'auto.function.solid.server',
      }),
    });
    expect(boundary!.attributes['solid.boundary.passes']).toBeGreaterThanOrEqual(1);
    // Backdated: the span covers the wait, on the record's clock.
    expect(boundary!.end_timestamp! - boundary!.start_timestamp).toBeGreaterThan(0.004);
  });
});
