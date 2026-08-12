import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { getMainCarrier, GLOBAL_OBJ, spanToStaticSpanJSON, withIsolationScope } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { AsyncLocalStorage } from 'async_hooks';
import { beforeEach, describe, expect, it } from 'vitest';
import { VercelEdgeClient } from '../src';
import { setupOtel } from '../src/sdk';
import { makeEdgeTransport } from '../src/transports';

// These tests reproduce, on the real Sentry OTEL edge stack (SentryTracerProvider + SentryPropagator +
// AsyncLocalStorage context manager), the exact chain Next.js runs for edge middleware:
//
//   adapter -> tracer.withPropagatedContext(request.headers, fn)
//           -> tracer.trace('Middleware.execute', ..., fn)   // <- this is the root span / transaction
//
// The `Middleware.execute` span is the transaction; its trace id is fixed at creation from the parent found on
// `context.active()`. If concurrent, header-less requests were to ever share that trace id, unrelated requests would
// collapse into one trace (thousands of transaction names under a single trace id in production).

const headersGetter = {
  keys: (headers: Headers): string[] => Array.from(headers.keys()),
  get: (headers: Headers, key: string): string | undefined => headers.get(key) ?? undefined,
};

// Mirrors next/dist/server/lib/trace/tracer.js `withPropagatedContext`.
function withPropagatedContext<T>(headers: Headers, fn: () => T): T {
  const activeContext = context.active();
  if (trace.getSpanContext(activeContext)) {
    return fn();
  }
  const remoteContext = propagation.extract(activeContext, headers, headersGetter);
  return context.with(remoteContext, fn);
}

// Mirrors next/dist/server/lib/trace/tracer.js `trace` for the `Middleware.execute` span.
function nextMiddlewareTrace<T>(pathname: string, fn: () => T): T {
  const tracer = trace.getTracer('next.js', '0.0.1');
  const spanContext = context.active() ?? ROOT_CONTEXT;
  return context.with(spanContext, () =>
    tracer.startActiveSpan(
      `middleware GET ${pathname}`,
      { attributes: { 'next.span_type': 'Middleware.execute', 'next.span_name': `middleware GET ${pathname}` } },
      span => {
        try {
          return fn();
        } finally {
          span.end();
        }
      },
    ),
  );
}

// Runs one middleware request end-to-end. `delay` yields to the event loop mid-request so that concurrent requests
// genuinely interleave (rather than running to completion synchronously one after another).
async function runMiddlewareRequest(
  url: string,
  headers: Record<string, string> = {},
  delay = 0,
): Promise<{ traceId: string; childTraceId: string }> {
  const request = new Request(url, { method: 'GET', headers });
  // Faithfully mirror production ordering: Next's native OTEL creates the `Middleware.execute` root span
  // (via `withPropagatedContext` -> `trace`) BEFORE `wrapMiddlewareWithSentry` forks its isolation scope.
  // So the root span's trace id is fixed by `extract` (SentryPropagator), not by the later fork - the fork
  // is nested *inside* the span callback, exactly like `wrapMiddlewareWithSentry`.
  return withPropagatedContext(request.headers, () =>
    nextMiddlewareTrace(new URL(url).pathname, () =>
      withIsolationScope(async () => {
        const rootSpan = trace.getActiveSpan()!;
        const traceId = spanToStaticSpanJSON(rootSpan).trace_id!;

        await new Promise(resolve => setTimeout(resolve, delay));

        // A child span started within the request must parent onto this request's root span (same trace id), not onto a
        // concurrent request's span.
        const childTracer = trace.getTracer('user');
        const childSpan = childTracer.startSpan('user-work');
        const childTraceId = spanToStaticSpanJSON(
          childSpan as unknown as Parameters<typeof spanToStaticSpanJSON>[0],
        ).trace_id!;
        childSpan.end();

        await new Promise(resolve => setTimeout(resolve, delay));

        return { traceId, childTraceId };
      }),
    ),
  );
}

describe('Next.js edge middleware trace isolation', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    (GLOBAL_OBJ as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;

    const client = new VercelEdgeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      stackParser: () => [],
      integrations: [],
      transport: makeEdgeTransport,
      tracesSampleRate: 1,
    });

    setupOtel(client);
    setOpenTelemetryContextAsyncContextStrategy();
  });

  it('gives concurrent header-less requests to unrelated routes distinct trace ids', async () => {
    const urls = [
      'https://docs.sentry.io/',
      'https://docs.sentry.io/platforms/python/',
      'https://docs.sentry.io/product/configuration/',
      'https://docs.sentry.io/platforms/javascript/',
    ];

    const results = await Promise.all(urls.map((url, i) => runMiddlewareRequest(url, {}, (i + 1) * 5)));
    const traceIds = results.map(r => r.traceId);

    expect(traceIds).toHaveLength(urls.length);
    expect(new Set(traceIds).size).toBe(urls.length);
    traceIds.forEach(id => expect(id).toMatch(/^[a-f0-9]{32}$/));
  });

  it('parents a request-local child span onto its own request trace, not a concurrent one', async () => {
    const results = await Promise.all([
      runMiddlewareRequest('https://docs.sentry.io/a', {}, 10),
      runMiddlewareRequest('https://docs.sentry.io/b', {}, 5),
    ]);

    results.forEach(({ traceId, childTraceId }) => {
      expect(childTraceId).toBe(traceId);
    });
    expect(results[0]!.traceId).not.toBe(results[1]!.traceId);
  });

  it('continues the incoming trace when each concurrent request carries a distinct sentry-trace header', async () => {
    const incomingTraceIdA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const incomingTraceIdB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const [a, b] = await Promise.all([
      runMiddlewareRequest(
        'https://docs.sentry.io/one',
        { 'sentry-trace': `${incomingTraceIdA}-1111111111111111-1` },
        5,
      ),
      runMiddlewareRequest(
        'https://docs.sentry.io/two',
        { 'sentry-trace': `${incomingTraceIdB}-2222222222222222-1` },
        5,
      ),
    ]);

    expect(a!.traceId).toBe(incomingTraceIdA);
    expect(b!.traceId).toBe(incomingTraceIdB);
  });

  it('does not join a shared trace when requests carry malformed sentry-trace headers', async () => {
    const results = await Promise.all([
      runMiddlewareRequest('https://docs.sentry.io/m1', { 'sentry-trace': 'not-a-valid-trace' }, 5),
      runMiddlewareRequest('https://docs.sentry.io/m2', { 'sentry-trace': 'garbage-header-value' }, 5),
    ]);
    const traceIds = results.map(r => r.traceId);

    expect(traceIds).toHaveLength(2);
    expect(new Set(traceIds).size).toBe(2);
    traceIds.forEach(id => expect(id).toMatch(/^[a-f0-9]{32}$/));
  });
});
