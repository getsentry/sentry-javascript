import { context, createContextKey, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { HTTP_ROUTE, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import type { Client, Span } from '@sentry/core';
import {
  getActiveSpan,
  getAsyncContextStrategy,
  getClient,
  getGlobalScope,
  getMainCarrier,
  getRootSpan,
  GLOBAL_OBJ,
  SDK_VERSION,
  spanIsSampled,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withSentry } from '../../src/cloudflare';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import { init as initEdge } from '../../src/edge';
import { init as initServer } from '../../src/server';
import { NEXTJS_SERVER_IGNORE_SPANS } from '../../src/server/serverSpanHooks';

const DSN = 'https://public@dsn.ingest.sentry.io/1337';

describe('withSentry', () => {
  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    (GLOBAL_OBJ as typeof GLOBAL_OBJ & { __SENTRY_CLOUDFLARE_CLIENT__?: unknown }).__SENTRY_CLOUDFLARE_CLIENT__ =
      undefined;
    delete (GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewritesTunnelPath?: string })._sentryRewritesTunnelPath;
    delete (GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRelease?: string })._sentryRelease;
    vi.restoreAllMocks();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('creates the Cloudflare client with the Next.js integration, SDK metadata and span filters', async () => {
    let client: Client | undefined;
    const handler = withSentry(() => ({ dsn: DSN }), {
      fetch: () => {
        client = getClient();
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getIntegrationByName('Nextjs')).toBeDefined();
    expect(
      client?.getEventProcessors().filter(processor => processor.id === 'DropReactControlFlowErrors'),
    ).toHaveLength(1);
    expect(client?.getOptions()).toHaveProperty('enableOpenTelemetrySetup', true);
    expect(client?.getOptions()._metadata).toEqual({
      sdk: {
        name: 'sentry.javascript.nextjs',
        version: SDK_VERSION,
        packages: [
          { name: 'npm:@sentry/nextjs', version: SDK_VERSION },
          { name: 'npm:@sentry/cloudflare', version: SDK_VERSION },
        ],
      },
    });
    expect(client?.getOptions().ignoreSpans).toEqual([
      ...NEXTJS_SERVER_IGNORE_SPANS,
      { attributes: { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest' } },
    ]);
  });

  it('adds the Next.js defaults when the callback returns no options and the env holds the DSN', async () => {
    let client: Client | undefined;
    const handler = withSentry(() => undefined, {
      fetch: () => {
        client = getClient();
        return new Response('ok');
      },
    });

    const response = await handler.fetch?.(new Request('https://example.com/') as never, { SENTRY_DSN: DSN }, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);
    await response?.text();

    expect(client?.getOptions().dsn).toBe(DSN);
    expect(client?.getIntegrationByName('Nextjs')).toBeDefined();
    expect(client?.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.nextjs');
  });

  it('keeps the options the callback returns', async () => {
    const userIgnoreSpan = /^GET \/health$/;
    let client: Client | undefined;
    const handler = withSentry(
      () => ({ dsn: DSN, enableOpenTelemetrySetup: false, tracesSampleRate: 0.5, ignoreSpans: [userIgnoreSpan] }),
      {
        fetch: () => {
          client = getClient();
          return new Response('ok');
        },
      },
    );

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getOptions()).toHaveProperty('enableOpenTelemetrySetup', false);
    expect(client?.getOptions().tracesSampleRate).toBe(0.5);
    expect(client?.getOptions().ignoreSpans).toEqual([
      userIgnoreSpan,
      ...NEXTJS_SERVER_IGNORE_SPANS,
      { attributes: { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest' } },
    ]);
  });

  it('adds the integrations the callback returns to the Next.js integrations', async () => {
    const userIntegration = { name: 'UserIntegration' };
    let client: Client | undefined;
    const handler = withSentry(() => ({ dsn: DSN, integrations: [userIntegration] }), {
      fetch: () => {
        client = getClient();
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getIntegrationByName('UserIntegration')).toBe(userIntegration);
    expect(client?.getIntegrationByName('Nextjs')).toBeDefined();
  });

  it('passes the Next.js integrations to an `integrations` function of the callback', async () => {
    let client: Client | undefined;
    const handler = withSentry(
      () => ({
        dsn: DSN,
        integrations: integrations => integrations.filter(integration => integration.name !== 'NextjsUseCache'),
      }),
      {
        fetch: () => {
          client = getClient();
          return new Response('ok');
        },
      },
    );

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getIntegrationByName('Nextjs')).toBeDefined();
    expect(client?.getIntegrationByName('NextjsUseCache')).toBeUndefined();
  });

  it('adds the Next.js integrations when the callback sets `defaultIntegrations`', async () => {
    let client: Client | undefined;
    const handler = withSentry(() => ({ dsn: DSN, defaultIntegrations: false }), {
      fetch: () => {
        client = getClient();
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getIntegrationByName('Nextjs')).toBeDefined();
    expect(client?.getIntegrationByName('NextjsUseCache')).toBeDefined();
  });

  it('does not sample the request span of a request to the tunnel route', async () => {
    (GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewritesTunnelPath?: string })._sentryRewritesTunnelPath =
      '/monitoring';
    const sampledByPath: Record<string, boolean> = {};
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: (request: Request) => {
        const activeSpan = getActiveSpan();
        sampledByPath[new URL(request.url).pathname] = !!activeSpan && spanIsSampled(activeSpan);
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/monitoring?o=1&p=2') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);
    await handler.fetch?.(new Request('https://example.com/page') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(sampledByPath).toEqual({ '/monitoring': false, '/page': true });
  });

  it('does not sample the request span of a request to the tunnel route when a `tracesSampler` samples every span', async () => {
    (GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewritesTunnelPath?: string })._sentryRewritesTunnelPath =
      '/monitoring';
    const sampledByPath: Record<string, boolean> = {};
    const handler = withSentry(() => ({ dsn: DSN, tracesSampler: () => 1 }), {
      fetch: (request: Request) => {
        const activeSpan = getActiveSpan();
        sampledByPath[new URL(request.url).pathname] = !!activeSpan && spanIsSampled(activeSpan);
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/monitoring?o=1&p=2') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);
    await handler.fetch?.(new Request('https://example.com/page') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(sampledByPath).toEqual({ '/monitoring': false, '/page': true });
  });

  it('injects the trace data of the active span with the global propagator', async () => {
    const carrier: Record<string, string> = {};
    let activeSpan: Span | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        activeSpan = getActiveSpan();
        propagation.inject(context.active(), carrier);
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(carrier['sentry-trace']).toBe(`${activeSpan?.spanContext().traceId}-${activeSpan?.spanContext().spanId}-1`);
  });

  it('injects nothing while Next.js prerenders a page in a request', async () => {
    const carrier: Record<string, string> = {};
    const requestCarrier: Record<string, string> = {};
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        trace.getTracer('next.js').startActiveSpan(
          'prerender route (app) /isr',
          {
            attributes: {
              [ATTR_NEXT_SPAN_TYPE]: 'AppRender.getBodyResult',
              [ATTR_NEXT_SPAN_NAME]: 'prerender route (app) /isr',
            },
          },
          span => {
            propagation.inject(context.active(), carrier);
            span.end();
          },
        );
        propagation.inject(context.active(), requestCarrier);
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(carrier).toEqual({});
    expect(requestCarrier['sentry-trace']).toMatch(/^[0-9a-f]{32}-[0-9a-f]{16}-1$/);
  });

  it('does not set the global propagator when the callback turns off the OpenTelemetry setup', async () => {
    const setGlobalPropagator = vi.spyOn(propagation, 'setGlobalPropagator');
    const handler = withSentry(() => ({ dsn: DSN, enableOpenTelemetrySetup: false }), {
      fetch: () => new Response('ok'),
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(setGlobalPropagator).not.toHaveBeenCalled();
  });

  it('starts a span under an extracted remote parent as a root span that continues its trace', async () => {
    const traceId = '12312012123120121231201212312012';
    const parentSpanId = '1121201211212012';
    let consumerSpan: Span | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        context.with(propagation.extract(ROOT_CONTEXT, { 'sentry-trace': `${traceId}-${parentSpanId}-1` }), () => {
          trace.getTracer('test').startActiveSpan('consumer', span => {
            consumerSpan = span as Span;
            span.end();
          });
        });
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(getRootSpan(consumerSpan!)).toBe(consumerSpan);
    expect(spanToJSON(consumerSpan!)).toMatchObject({ trace_id: traceId, parent_span_id: parentSpanId });
  });

  it('keeps the request span as parent when Next.js extracts the incoming trace it continued again', async () => {
    const traceId = '12312012123120121231201212312012';
    const parentSpanId = '1121201211212012';
    let rootSpan: Span | undefined;
    let pageSpan: Span | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: (request: Request) => {
        rootSpan = getRootSpan(getActiveSpan()!);
        const headers = Object.fromEntries(request.headers);
        // `withPropagatedContext` of Next.js with `force`, which it uses when it misses its router server context.
        const remoteContext = propagation.extract(ROOT_CONTEXT, headers);
        const pageContext = trace.getSpanContext(remoteContext)
          ? remoteContext
          : propagation.extract(context.active(), headers);
        context.with(pageContext, () => {
          trace.getTracer('test').startActiveSpan('GET /about/page', span => {
            pageSpan = span as Span;
            span.end();
          });
        });
        return new Response('ok');
      },
    });

    const response = await handler.fetch?.(
      new Request('https://example.com/about', {
        headers: { 'sentry-trace': `${traceId}-${parentSpanId}-1` },
      }) as never,
      {},
      { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as never,
    );
    await response?.text();

    expect(spanToJSON(rootSpan!)).toMatchObject({ trace_id: traceId, parent_span_id: parentSpanId });
    expect(getRootSpan(pageSpan!)).toBe(rootSpan);
  });

  it('attaches the children of the Next.js request span to the request span of `withSentry`', async () => {
    let rootSpan: Span | undefined;
    let activeSpanInRequestSpan: Span | undefined;
    let renderSpan: Span | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        rootSpan = getRootSpan(getActiveSpan()!);
        trace
          .getTracer('test')
          .startActiveSpan('GET /about', { attributes: { 'next.span_type': 'BaseServer.handleRequest' } }, span => {
            activeSpanInRequestSpan = getActiveSpan();
            trace.getTracer('test').startActiveSpan('render route (app) /about', childSpan => {
              renderSpan = childSpan as Span;
              childSpan.end();
            });
            span.end();
          });
        return new Response('ok');
      },
    });

    const response = await handler.fetch?.(new Request('https://example.com/about') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);
    await response?.text();

    expect(activeSpanInRequestSpan).toBe(rootSpan);
    expect(spanToJSON(renderSpan!).parent_span_id).toBe(rootSpan!.spanContext().spanId);
  });

  it('starts a new trace for a span under a context extracted without trace headers', async () => {
    let requestTraceId: string | undefined;
    let spanTraceId: string | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        requestTraceId = getActiveSpan()?.spanContext().traceId;
        context.with(propagation.extract(ROOT_CONTEXT, {}), () => {
          trace.getTracer('test').startActiveSpan('consumer', span => {
            spanTraceId = span.spanContext().traceId;
            span.end();
          });
        });
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(spanTraceId).toEqual(expect.stringMatching(/^[a-f0-9]{32}$/));
    expect(spanTraceId).not.toBe(requestTraceId);
  });

  it('names the request span after the `http.route` Next.js sets on it', async () => {
    let rootSpan: Span | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        rootSpan = getRootSpan(getActiveSpan()!);
        rootSpan.setAttribute(HTTP_ROUTE, '/api/users/[id]');
        // With a length, the request span ends with the response, in the request. Node.js 26 ends the span of a
        // streamed body in the async context of its reader, which has no client to run the `spanEnd` hooks.
        return new Response('ok', { headers: { 'content-length': '2' } });
      },
    });

    await handler.fetch?.(new Request('https://example.com/api/users/1') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(spanToJSON(rootSpan!).name).toBe('GET /api/users/[id]');
    expect(spanToJSON(rootSpan!).attributes).toMatchObject({
      [HTTP_ROUTE]: '/api/users/[id]',
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
    });
  });

  it('names the request span after the route a Pages Router API route wrapper backfills', async () => {
    let rootSpan: Span | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        rootSpan = getRootSpan(getActiveSpan()!);
        rootSpan.setAttribute('sentry.route_backfill', '/api/users/[id]');
        return new Response('ok', { headers: { 'content-length': '2' } });
      },
    });

    await handler.fetch?.(new Request('https://example.com/api/users/1', { method: 'POST' }) as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(spanToJSON(rootSpan!).name).toBe('POST /api/users/[id]');
    expect(spanToJSON(rootSpan!).attributes).toMatchObject({
      [HTTP_ROUTE]: '/api/users/[id]',
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
    });
  });

  it('sets the release of `Sentry.init` on a client created after it ran', async () => {
    let client: Client | undefined;
    const handler = withSentry(() => ({ dsn: DSN }), {
      fetch: () => {
        client = getClient();
        return new Response('ok');
      },
    });
    initEdge({ release: 'build' });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getOptions().release).toBe('build');
  });

  it('keeps the release from `SENTRY_RELEASE` over the release of `Sentry.init`', async () => {
    let client: Client | undefined;
    const handler = withSentry(() => ({ dsn: DSN }), {
      fetch: () => {
        client = getClient();
        return new Response('ok');
      },
    });
    initEdge({ release: 'build' });

    await handler.fetch?.(new Request('https://example.com/') as never, { SENTRY_RELEASE: 'env' }, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(client?.getOptions().release).toBe('env');
  });

  it('leaves the control flow error processor to its client when `Sentry.init` of the server build runs during a request', async () => {
    const handler = withSentry(() => ({ dsn: DSN }), {
      fetch: () => {
        initServer({});
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(
      getGlobalScope()
        .getScopeData()
        .eventProcessors.filter(processor => processor.id === 'DropReactControlFlowErrors'),
    ).toHaveLength(0);
  });

  it('leaves the control flow error processor to its clients when `Sentry.init` of the server build runs outside a request', () => {
    withSentry(() => ({ dsn: DSN }), { fetch: () => new Response('ok') });

    initServer({});

    expect(
      getGlobalScope()
        .getScopeData()
        .eventProcessors.filter(processor => processor.id === 'DropReactControlFlowErrors'),
    ).toHaveLength(0);
  });

  // https://github.com/getsentry/sentry-javascript/issues/24603
  it('keeps its async context strategy when `Sentry.init` of the edge build runs during a request', async () => {
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        initEdge({ dsn: DSN });
        startSpan({ name: 'after-init' }, () => undefined);
        return new Response('ok');
      },
    });
    const strategy = getAsyncContextStrategy(getMainCarrier());

    const response = await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(response?.status).toBe(200);
    expect(getAsyncContextStrategy(getMainCarrier())).toBe(strategy);
  });

  it('keeps OpenTelemetry context values and parents when `Sentry.init` of the edge build runs during a request', async () => {
    const contextKey = createContextKey('sentry.test.tenant');
    let contextValue: unknown;
    let outerSpanId: string | undefined;
    let innerParentSpanId: string | undefined;
    const handler = withSentry(() => ({ dsn: DSN, tracesSampleRate: 1 }), {
      fetch: () => {
        initEdge({ dsn: DSN });
        context.with(context.active().setValue(contextKey, 'tenant-42'), () => {
          trace.getTracer('test').startActiveSpan('outer', outer => {
            const inner = trace.getTracer('test').startSpan('inner', {}, context.active());
            contextValue = context.active().getValue(contextKey);
            outerSpanId = outer.spanContext().spanId;
            innerParentSpanId = spanToJSON(inner as never).parent_span_id;
            inner.end();
            outer.end();
          });
        });
        return new Response('ok');
      },
    });

    await handler.fetch?.(new Request('https://example.com/') as never, {}, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as never);

    expect(contextValue).toBe('tenant-42');
    expect(innerParentSpanId).toBe(outerSpanId);
  });
});
