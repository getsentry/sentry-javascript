import {
  SENTRY_SEGMENT_NAME_SOURCE,
  HTTP_METHOD,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  HTTP_TARGET,
  URL_QUERY,
} from '@sentry/conventions/attributes';
import type { Client, Options, Span } from '@sentry/core';
import {
  getIsolationScope,
  getRootSpan,
  hasSpanStreamingEnabled,
  HTTP_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
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

  // What we do in this glorious piece of code, is hoist any information about parameterized routes from spans emitted
  // by Next.js via the `next.route` attribute, up to the transaction by setting the http.route attribute.
  if (typeof spanAttributes?.[ATTR_NEXT_ROUTE] === 'string') {
    // Only hoist the http.route attribute if the transaction doesn't already have it
    if (
      // eslint-disable-next-line typescript/no-deprecated
      (rootSpanAttributes?.[HTTP_REQUEST_METHOD] || rootSpanAttributes?.[HTTP_METHOD]) &&
      !rootSpanAttributes?.[HTTP_ROUTE]
    ) {
      const route = spanAttributes[ATTR_NEXT_ROUTE].replace(/\/route$/, '');
      // eslint-disable-next-line typescript/no-deprecated
      const method = rootSpanAttributes?.[HTTP_REQUEST_METHOD] || rootSpanAttributes?.[HTTP_METHOD];

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
  }

  if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] === 'Middleware.execute') {
    const middlewareName = spanAttributes[ATTR_NEXT_SPAN_NAME];
    if (typeof middlewareName === 'string') {
      rootSpan.updateName(middlewareName);
      rootSpan.setAttributes({
        [HTTP_ROUTE]: middlewareName,
        [ATTR_NEXT_SPAN_NAME]: middlewareName,
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
      });
    }
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto');
  }

  // We want to skip span data inference for any spans generated by Next.js. Reason being that Next.js emits spans
  // with patterns (e.g. http.server spans) that will produce confusing data.
  if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] !== undefined) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto');
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
