import type { Span } from '@opentelemetry/api';
import {
  captureException,
  getActiveSpan,
  getClient,
  getHttpSpanDetailsFromUrlObject,
  getRootSpan,
  GLOBAL_OBJ,
  httpHeadersToSpanAttributes,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpanManual,
  updateSpanName,
} from '@sentry/core';
import { tracingChannel, type TracingChannelContextWithSpan } from '@sentry/opentelemetry/tracing-channel';

const NOOP = (): void => {};

// ── Nuxt channel types ──

interface NuxtRenderData {
  event?: { path?: string };
  streaming?: boolean;
  result?: unknown;
  error?: Error;
}

interface NuxtIslandData {
  event?: { path?: string };
  islandContext?: { name?: string };
  result?: unknown;
  error?: Error;
}

interface NuxtDataData {
  key?: string;
  functionName?: string;
  result?: unknown;
  error?: Error;
}

interface NuxtPluginData {
  plugin?: { name?: string; parallel?: boolean };
  result?: unknown;
  error?: Error;
}

// ── h3/srvx channel types (simplified from Nitro SDK) ──

interface H3RequestData {
  event: {
    url: { href: string };
    req: { method?: string };
    context?: { matchedRoute?: { route?: string }; params?: Record<string, string> };
  };
  type?: string;
  result?: unknown;
  error?: unknown;
}

interface SrvxRequestData {
  request: Request & { _url?: URL };
  server: { options: { port?: number } };
  middleware?: { index?: number; handler: { name?: string } };
  result?: unknown;
  error?: unknown;
}

// ── Storage types (simplified from Nitro SDK) ──

interface StorageTraceContext {
  keys?: string[];
  base?: string;
  driver?: { name?: string };
  result?: unknown;
  error?: unknown;
}

const TRACED_STORAGE_OPS = [
  'hasItem', 'getItem', 'getItemRaw', 'getItems',
  'setItem', 'setItemRaw', 'setItems',
  'removeItem', 'getKeys', 'clear',
] as const;

const CACHE_HIT_OPS = new Set(['hasItem', 'getItem', 'getItemRaw']);

// ── Guard ──

const globalWithChannels = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __SENTRY_NUXT_DC_INSTRUMENTED__: boolean;
};

/**
 * Subscribe Sentry handlers to Nuxt, h3, srvx, and unstorage diagnostics_channel events.
 *
 * Requires Nuxt with `tracingChannel: true` (nuxt/nuxt#35191).
 */
export function subscribeNuxtDiagnosticChannels(): void {
  if (globalWithChannels.__SENTRY_NUXT_DC_INSTRUMENTED__) return;

  // eslint-disable-next-line no-console
  console.log('[Sentry] Subscribing to Nuxt TracingChannels');

  try {
    setupNuxtChannels();
    setupSrvxChannels();
    setupH3Channels();
    setupStorageChannels();
    globalWithChannels.__SENTRY_NUXT_DC_INSTRUMENTED__ = true;
  } catch {
    // diagnostics_channel not available, fail closed
  }
}

// ── Nuxt channels ──

function setupNuxtChannels(): void {
  const ORIGIN = 'auto.http.nuxt.diagnostic_channel';

  setupSimpleChannel<NuxtRenderData>('nuxt.render', data =>
    startSpanManual(
      {
        name: `nuxt.render ${data.event?.path || '/'}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.render',
          'nuxt.streaming': data.streaming ?? false,
          'http.route': data.event?.path,
        },
      },
      span => span,
    ) as Span,
  );

  setupSimpleChannel<NuxtIslandData>('nuxt.island', data =>
    startSpanManual(
      {
        name: `nuxt.island ${data.islandContext?.name || 'unknown'}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.render.island',
          'nuxt.island.name': data.islandContext?.name,
          'http.route': data.event?.path,
        },
      },
      span => span,
    ) as Span,
  );

  setupSimpleChannel<NuxtDataData>('nuxt.data', data =>
    startSpanManual(
      {
        name: `nuxt.data ${data.key || 'unknown'}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'nuxt.data',
          'nuxt.data.key': data.key,
          'nuxt.data.function_name': data.functionName,
        },
      },
      span => span,
    ) as Span,
  );

  setupSimpleChannel<NuxtPluginData>('nuxt.plugin', data =>
    startSpanManual(
      {
        name: `nuxt.plugin ${data.plugin?.name || 'unknown'}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'nuxt.plugin',
          'nuxt.plugin.name': data.plugin?.name,
          'nuxt.plugin.parallel': data.plugin?.parallel,
        },
      },
      span => span,
    ) as Span,
  );
}

// ── srvx channels (from Nitro SDK) ──

function setupSrvxChannels(): void {
  const ORIGIN = 'auto.http.nuxt.srvx';

  const srvxChannel = tracingChannel<SrvxRequestData>('srvx.request', data => {
    const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
    const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', ORIGIN, {
      method: data.request.method,
    });

    const sendDefaultPii = getClient()?.getOptions().sendDefaultPii ?? false;
    const headerAttributes = httpHeadersToSpanAttributes(
      Object.fromEntries(data.request.headers.entries()),
      sendDefaultPii,
    );

    return startSpanManual(
      {
        name: spanName,
        attributes: {
          ...urlAttributes,
          ...headerAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data.middleware ? 'middleware.nitro' : 'http.server',
          'server.port': data.server.options.port,
        },
      },
      span => span,
    );
  });

  srvxChannel.subscribe({
    asyncEnd: (data: TracingChannelContextWithSpan<SrvxRequestData>) => {
      const statusCode = getResponseStatusCode(data.result);
      if (data._sentrySpan && statusCode !== undefined) {
        setHttpStatus(data._sentrySpan, statusCode);
      }
      data._sentrySpan?.end();
    },
    error: (data: TracingChannelContextWithSpan<SrvxRequestData> & { error: unknown }) => {
      captureException(data.error, { mechanism: { type: 'auto.http.nuxt.srvx', handled: false } });
      data._sentrySpan?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      data._sentrySpan?.end();
    },
  });
}

// ── h3 channels (from Nitro SDK) ──

function setupH3Channels(): void {
  const ORIGIN = 'auto.http.nuxt.h3';

  const h3Channel = tracingChannel<H3RequestData>('h3.request', data => {
    const parsedUrl = parseStringToURLObject(data.event.url.href);
    const routePattern = data.event.context?.matchedRoute?.route;

    const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', ORIGIN, {
      method: data.event.req.method,
    }, routePattern && routePattern !== '/**' ? routePattern : undefined);

    return startSpanManual(
      {
        name: spanName,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data.type === 'middleware' ? 'middleware.nitro' : 'http.server',
        },
      },
      span => span,
    );
  });

  h3Channel.subscribe({
    asyncEnd: (data: TracingChannelContextWithSpan<H3RequestData>) => {
      const statusCode = getResponseStatusCode(data.result);
      if (data._sentrySpan && statusCode !== undefined) {
        setHttpStatus(data._sentrySpan, statusCode);
      }
      data._sentrySpan?.end();

      // Update root span with parameterized route
      if (data._sentrySpan) {
        const rootSpan = getRootSpan(data._sentrySpan);
        const routePattern = data.event.context?.matchedRoute?.route;
        if (rootSpan && rootSpan !== data._sentrySpan && routePattern && routePattern !== '/**') {
          const method = data.event.req.method || 'GET';
          updateSpanName(rootSpan, `${method} ${routePattern}`);
          rootSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'http.route': routePattern,
          });
        }
      }
    },
    error: (data: TracingChannelContextWithSpan<H3RequestData> & { error: unknown }) => {
      captureException(data.error, { mechanism: { type: 'auto.http.nuxt.h3', handled: false } });
      data._sentrySpan?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      data._sentrySpan?.end();
    },
  });
}

// ── unstorage channels (from Nitro SDK) ──

function setupStorageChannels(): void {
  const ORIGIN = 'auto.cache.nuxt';

  for (const operation of TRACED_STORAGE_OPS) {
    const channel = tracingChannel<StorageTraceContext>(`unstorage.${operation}`, data => {
      const cacheKeys = data.keys ?? [];
      const mountBase = (data.base ?? '').replace(/:$/, '');

      return startSpanManual(
        {
          name: cacheKeys.join(', ') || operation,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `cache.${operation.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`)}`,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_CACHE_KEY]: cacheKeys.length > 1 ? cacheKeys : cacheKeys[0],
            'db.operation.name': operation,
            'db.collection.name': mountBase,
            'db.system.name': data.driver?.name ?? 'unknown',
          },
        },
        span => span,
      );
    });

    channel.subscribe({
      asyncEnd(data: TracingChannelContextWithSpan<StorageTraceContext & { result?: unknown }>) {
        if (data._sentrySpan && CACHE_HIT_OPS.has(operation)) {
          const hit = operation === 'hasItem' ? Boolean(data.result) : data.result != null;
          data._sentrySpan.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_HIT, hit);
        }
        data._sentrySpan?.setStatus({ code: SPAN_STATUS_OK });
        data._sentrySpan?.end();
      },
      error(data: TracingChannelContextWithSpan<StorageTraceContext> & { error: unknown }) {
        captureException(data.error, { mechanism: { handled: false, type: ORIGIN } });
        data._sentrySpan?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        data._sentrySpan?.end();
      },
    });
  }
}

// ── Helpers ──

function setupSimpleChannel<T extends object>(channelName: string, transformStart: (data: T) => Span): void {
  const channel = tracingChannel<T>(channelName, transformStart);

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: (data: TracingChannelContextWithSpan<T>) => {
      if (!(data as { error?: unknown }).error) data._sentrySpan?.end();
    },
    error: (data: TracingChannelContextWithSpan<T> & { error: unknown }) => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error instanceof Error ? data.error.message : String(data.error) });
      }
      span.end();
    },
  });
}

function getResponseStatusCode(result: unknown): number | undefined {
  if (result && typeof result === 'object' && 'status' in result && typeof result.status === 'number') {
    return result.status;
  }
  return undefined;
}
