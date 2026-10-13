import {
  SENTRY_SEGMENT_NAME_SOURCE,
  HTTP_METHOD,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  HTTP_TARGET,
  SENTRY_OP,
  SENTRY_ORIGIN,
  URL_QUERY,
} from '@sentry/conventions/attributes';
import { MIDDLEWARE } from '@sentry/conventions/op';
import type { Client, Options, Span } from '@sentry/core';
import {
  getIsolationScope,
  getRootSpan,
  hasSpanStreamingEnabled,
  HTTP_SPAN_NAME_FALLBACK,
  spanToJSON,
} from '@sentry/core';
import { enhanceMiddlewareRootSpan } from '../common/enhanceMiddlewareRootSpan';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../common/span-attributes-with-logic-attached';
import { addHeadersAsAttributes } from '../common/utils/addHeadersAsAttributes';
import { backfillHttpServerStatus } from '../common/utils/backfillHttpServerStatus';
import { dropMiddlewareTunnelRequests } from '../common/utils/dropMiddlewareTunnelRequests';
import { createLiveRootSpanAdapter } from '../common/utils/liveRootSpanAdapter';
import { maybeForkIsolationScopeForRootSpan } from '../common/utils/forkIsolationScopeForRootSpan';
import { setUrlProcessingMetadata } from '../common/utils/setUrlProcessingMetadata';
import { maybeEnhanceServerComponentSpanName } from '../common/utils/tracingUtils';
import { enhanceHandleRequestRootSpan } from './enhanceHandleRequestRootSpan';
import { maybeCompleteCronCheckIn, maybeStartCronCheckIn } from './vercelCronsMonitoring';
import {
  maybeCleanupQueueSpan,
  maybeEnrichQueueConsumerSpan,
  maybeEnrichQueueProducerSpan,
} from './vercelQueuesMonitoring';

const NEXTJS_ERROR_PAGE_ROUTES = ['/500', '/_error'];

export const NEXTJS_SERVER_IGNORE_SPANS: NonNullable<Options['ignoreSpans']> = [
  // Static assets (matches `_next/static` anywhere in the name to handle custom basePath)
  /^GET (\/.*)?\/_next\/static\//,
  // Dev source-map fetch endpoints
  /\/__nextjs_original-stack-frame/,
  // Pages router /404
  /^\/404$/,
  // App router /404 and /_not-found segments (any HTTP method)
  /^(GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH) \/(404|_not-found)$/,
  // Root transactions named "NextServer.getRequestHandler" containing useless tracing
  /^NextServer\.getRequestHandler$/,
  // Spans flagged via TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION
  // (set in `dropMiddlewareTunnelRequests` during `spanStart`)
  { attributes: { [TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]: true } },
];

/**
 * Registers the hooks that name, enrich and filter the spans and events of the Next.js server on `client`.
 */
export function addNextjsServerSpanHooks(client: Client): void {
  client.on('beforeSampling', ({ spanAttributes }, samplingDecision) => {
    // There are situations where the Next.js Node.js server forwards requests for the Edge Runtime server (e.g. in
    // middleware) and this causes spans for Sentry ingest requests to be created. These are not exempt from our tracing
    // because we didn't get the chance to do `suppressTracing`, since this happens outside of userland.
    // We need to drop these spans.
    if (
      // eslint-disable-next-line typescript/no-deprecated
      (typeof spanAttributes[HTTP_TARGET] === 'string' &&
        // eslint-disable-next-line typescript/no-deprecated
        spanAttributes[HTTP_TARGET].includes('sentry_key') &&
        // eslint-disable-next-line typescript/no-deprecated
        spanAttributes[HTTP_TARGET].includes('sentry_client')) ||
      (typeof spanAttributes[URL_QUERY] === 'string' &&
        spanAttributes[URL_QUERY].includes('sentry_key') &&
        spanAttributes[URL_QUERY].includes('sentry_client'))
    ) {
      samplingDecision.decision = false;
    }
  });

  client.on('spanStart', span => handleOnSpanStart(span, client));

  // Normalize name/op/source/status on the request root span at span end, before it is serialized into
  // a transaction event (legacy) or streamed span JSON. Running on the live span means both lifecycles
  // pick up the changes from one place, and the cron/queue hooks below see the finalized status.
  client.on('spanEnd', span => {
    if (span !== getRootSpan(span)) {
      return;
    }

    const mutableRootSpan = createLiveRootSpanAdapter(span);
    enhanceHandleRequestRootSpan(mutableRootSpan);
    enhanceMiddlewareRootSpan(mutableRootSpan);
    backfillHttpServerStatus(span);
  });

  client.on('spanEnd', maybeCompleteCronCheckIn);
  client.on('spanEnd', maybeCleanupQueueSpan);

  client.on('preprocessEvent', event => {
    setUrlProcessingMetadata(event);
  });
}

type SpanAttributes = ReturnType<typeof spanToJSON>['attributes'];

/**
 * Hoists the parameterized route that a Next.js span carries in `next.route` up to the root span, as its name and
 * `http.route`.
 */
function maybeHoistRouteToRootSpan(
  spanAttributes: SpanAttributes,
  rootSpan: Span,
  rootSpanAttributes: SpanAttributes,
): void {
  if (typeof spanAttributes?.[ATTR_NEXT_ROUTE] !== 'string') {
    return;
  }

  const route = spanAttributes[ATTR_NEXT_ROUTE].replace(/\/route$/, '');
  // When middleware throws, Next.js renders its error page. A root span that the middleware named keeps that name, as
  // on Node.js. A 404 page still names the root span.
  const isErrorPageBehindMiddleware =
    NEXTJS_ERROR_PAGE_ROUTES.includes(route) && rootSpanAttributes?.[SENTRY_SEGMENT_NAME_SOURCE] === 'route';
  // eslint-disable-next-line typescript/no-deprecated
  const method = rootSpanAttributes?.[HTTP_REQUEST_METHOD] || rootSpanAttributes?.[HTTP_METHOD];

  // Only hoist the http.route attribute if the transaction doesn't already have it
  if (!method || rootSpanAttributes?.[HTTP_ROUTE] || isErrorPageBehindMiddleware) {
    return;
  }

  const name = typeof method === 'string' ? `${method} ${route}` : route;
  rootSpan.updateName(name);
  rootSpan.setAttributes({
    [HTTP_ROUTE]: route,
    // Preserving the original attribute despite internally not depending on it
    [ATTR_NEXT_ROUTE]: route,
    [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
  });

  // Update the isolation scope's transaction name so that non-transaction events
  // (e.g. captureMessage, captureException) also get the parameterized route.
  getIsolationScope().setTransactionName(name);

  // Check if this is a Vercel cron request and start a check-in
  maybeStartCronCheckIn(rootSpan, route);

  // Enrich queue consumer spans (Vercel Queue push delivery via CloudEvent)
  maybeEnrichQueueConsumerSpan(rootSpan);
}

/** Names the root span after the middleware. When Next.js did not start the root span, also sets the op of the middleware span. */
function handleMiddlewareSpanStart(
  span: Span,
  spanAttributes: SpanAttributes,
  rootSpan: Span,
  rootSpanAttributes: SpanAttributes,
): void {
  const middlewareName = spanAttributes?.[ATTR_NEXT_SPAN_NAME];
  if (rootSpanAttributes?.[ATTR_NEXT_SPAN_TYPE] === undefined) {
    // The middleware runs inside a request span that Next.js did not start, e.g. the one of `withSentry` from
    // `@sentry/cloudflare`. That span gets the middleware name until a route span hoists its route, so a request
    // that the middleware answers is named like the middleware segment on Node.js.
    span.setAttribute(SENTRY_OP, MIDDLEWARE);
    if (typeof middlewareName === 'string' && !rootSpanAttributes?.[HTTP_ROUTE]) {
      rootSpan.updateName(middlewareName);
      rootSpan.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'route');
    }
  } else if (typeof middlewareName === 'string') {
    rootSpan.updateName(middlewareName);
    rootSpan.setAttributes({
      [HTTP_ROUTE]: middlewareName,
      [ATTR_NEXT_SPAN_NAME]: middlewareName,
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
    });
  }
  span.setAttribute(SENTRY_ORIGIN, 'auto');
}

/**
 * Handles the on span start event for Next.js spans.
 * This function is used to enhance the span with additional information such as the route, the method, the headers, etc.
 * It is called for every span that is started by Next.js.
 * @param span The span that is starting.
 * @param client The client the hook is registered on.
 */
export function handleOnSpanStart(span: Span, client: Client): void {
  const spanAttributes = spanToJSON(span).attributes;
  const rootSpan = getRootSpan(span);
  const rootSpanAttributes = spanToJSON(rootSpan).attributes;
  const isRootSpan = span === rootSpan;

  dropMiddlewareTunnelRequests(span, spanAttributes);

  // Next.js names the incoming-request span after the raw URL. With span streaming, span names have to
  // be low cardinality, so we replace it here at span start; the `next.route` hoisting below renames it
  // to `${method} ${route}` once Next.js reports a route.
  if (
    isRootSpan &&
    spanAttributes?.[ATTR_NEXT_SPAN_TYPE] === 'BaseServer.handleRequest' &&
    hasSpanStreamingEnabled(client)
  ) {
    // eslint-disable-next-line typescript/no-deprecated
    const method = spanAttributes[HTTP_REQUEST_METHOD] ?? spanAttributes[HTTP_METHOD];
    createLiveRootSpanAdapter(span).setName(
      (typeof method === 'string' ? method.toUpperCase() : '') || HTTP_SPAN_NAME_FALLBACK,
    );
  }

  maybeHoistRouteToRootSpan(spanAttributes, rootSpan, rootSpanAttributes);

  if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] === 'Middleware.execute') {
    handleMiddlewareSpanStart(span, spanAttributes, rootSpan, rootSpanAttributes);
  }

  // We want to skip span data inference for any spans generated by Next.js. Reason being that Next.js emits spans
  // with patterns (e.g. http.server spans) that will produce confusing data.
  if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] !== undefined) {
    span.setAttribute(SENTRY_ORIGIN, 'auto');
  }

  if (isRootSpan) {
    const headers = getIsolationScope().getScopeData().sdkProcessingMetadata?.normalizedRequest?.headers;
    addHeadersAsAttributes(headers, rootSpan);
  }

  maybeForkIsolationScopeForRootSpan(span, spanAttributes);

  maybeEnhanceServerComponentSpanName(span, spanAttributes, rootSpanAttributes, client);

  // Enrich outgoing http.client spans targeting the Vercel Queues API (producer)
  maybeEnrichQueueProducerSpan(span);
}
