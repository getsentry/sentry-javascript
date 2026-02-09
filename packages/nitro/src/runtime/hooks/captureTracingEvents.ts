import {
  captureException,
  getActiveSpan,
  getClient,
  getHttpSpanDetailsFromUrlObject,
  GLOBAL_OBJ,
  httpHeadersToSpanAttributes,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setHttpStatus,
  type Span,
  SPAN_STATUS_ERROR,
  startSpanManual,
} from '@sentry/core';
import type { TracingRequestEvent as H3TracingRequestEvent } from 'h3/tracing';
import { tracingChannel } from 'otel-tracing-channel';
import type { RequestEvent as SrvxRequestEvent } from 'srvx/tracing';

/**
 * Global object with the trace channels
 */
const globalWithTraceChannels = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_HTTP_CHANNELS_INSTRUMENTED__: boolean;
};

/**
 * Captures tracing events emitted by Nitro tracing channels.
 */
export function captureTracingEvents(): void {
  if (globalWithTraceChannels.__SENTRY_NITRO_HTTP_CHANNELS_INSTRUMENTED__) {
    return;
  }

  setupH3TracingChannels();
  setupSrvxTracingChannels();
  globalWithTraceChannels.__SENTRY_NITRO_HTTP_CHANNELS_INSTRUMENTED__ = true;
}

/**
 * No-op function to satisfy the tracing channel subscribe callbacks
 */
const NOOP = (): void => {};

/**
 * Extracts the HTTP status code from a tracing channel result.
 * The result is the return value of the traced handler, which is a Response for srvx
 * and may or may not be a Response for h3.
 */
function getResponseStatusCode(result: unknown): number | undefined {
  if (result && typeof result === 'object' && 'status' in result && typeof result.status === 'number') {
    return result.status;
  }
  return undefined;
}

function onTraceEnd(data: { span?: Span; result?: unknown }): void {
  const statusCode = getResponseStatusCode(data.result);
  if (data.span && statusCode !== undefined) {
    setHttpStatus(data.span, statusCode);
  }

  data.span?.end();
}

function onTraceError(data: { span?: Span; error: unknown }): void {
  captureException(data.error);
  data.span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  data.span?.end();
}

function setupH3TracingChannels(): void {
  const h3Channel = tracingChannel<H3TracingRequestEvent>('h3.request', data => {
    const parsedUrl = parseStringToURLObject(data.event.url.href);
    const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.h3', {
      method: data.event.req.method,
    });

    return startSpanManual(
      {
        name: spanName,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.h3',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data?.type === 'middleware' ? 'middleware.nitro' : 'http.server',
        },
      },
      s => s,
    );
  });

  h3Channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: onTraceEnd,
    error: onTraceError,
  });
}

function setupSrvxTracingChannels(): void {
  // Store the parent span for all middleware and fetch to share
  // This ensures they all appear as siblings in the trace
  let requestParentSpan: Span | null = null;

  const fetchChannel = tracingChannel<SrvxRequestEvent>('srvx.request', data => {
    const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
    const [spanName, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.srvx', {
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
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: data.middleware ? 'middleware.nitro' : 'http.server',
          'server.port': data.server.options.port,
        },
        // Use the same parent span as middleware to make them siblings
        parentSpan: requestParentSpan || undefined,
      },
      span => span,
    );
  });

  // Subscribe to events (span already created in bindStore)
  fetchChannel.subscribe({
    start: () => {},
    asyncStart: () => {},
    end: () => {},
    asyncEnd: data => {
      onTraceEnd(data);

      // Reset parent span reference after the fetch handler completes
      // This ensures each request gets a fresh parent span capture
      requestParentSpan = null;
    },
    error: data => {
      onTraceError(data);
      // Reset parent span reference on error too
      requestParentSpan = null;
    },
  });

  const middlewareChannel = tracingChannel<SrvxRequestEvent>('srvx.middleware', data => {
    // For the first middleware, capture the current parent span
    if (data.middleware?.index === 0) {
      requestParentSpan = getActiveSpan() || null;
    }

    const parsedUrl = data.request._url ? parseStringToURLObject(data.request._url.href) : undefined;
    const [, urlAttributes] = getHttpSpanDetailsFromUrlObject(parsedUrl, 'server', 'auto.http.nitro.srvx', {
      method: data.request.method,
    });

    // Create span as a child of the original parent, not the previous middleware
    return startSpanManual(
      {
        name: `${data.middleware?.handler.name ?? 'unknown'} - ${data.request.method} ${data.request._url?.pathname}`,
        attributes: {
          ...urlAttributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nitro.srvx',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nitro',
        },
        parentSpan: requestParentSpan || undefined,
      },
      span => span,
    );
  });

  // Subscribe to events (span already created in bindStore)
  middlewareChannel.subscribe({
    start: () => {},
    asyncStart: () => {},
    end: () => {},
    asyncEnd: onTraceEnd,
    error: onTraceError,
  });
}
