import type { Client, HandlerDataFetch, Scope, Span, SpanOrigin } from '@sentry/types';
import {
  BAGGAGE_HEADER_NAME,
  SENTRY_BAGGAGE_KEY_PREFIX,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  isInstanceOf,
  parseUrl,
} from '@sentry/utils';
import { getClient, getCurrentScope, getIsolationScope } from './currentScopes';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from './semanticAttributes';
import {
  SPAN_STATUS_ERROR,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  setHttpStatus,
  startInactiveSpan,
} from './tracing';
import { SentryNonRecordingSpan } from './tracing/sentryNonRecordingSpan';
import { hasTracingEnabled } from './utils/hasTracingEnabled';
import { getActiveSpan, spanToTraceHeader } from './utils/spanUtils';

type PolymorphicRequestHeaders =
  | Record<string, string | undefined>
  | Array<[string, string]>
  // the below is not preicsely the Header type used in Request, but it'll pass duck-typing
  | {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
      append: (key: string, value: string) => void;
      get: (key: string) => string | null | undefined;
    };

/**
 * Create and track fetch request spans for usage in combination with `addFetchInstrumentationHandler`.
 *
 * @returns Span if a span was created, otherwise void.
 */
export function instrumentFetchRequest(
  handlerData: HandlerDataFetch,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
  spanOrigin: SpanOrigin = 'auto.http.browser',
): Span | undefined {
  if (!handlerData.fetchData) {
    return undefined;
  }

  const shouldCreateSpanResult = hasTracingEnabled() && shouldCreateSpan(handlerData.fetchData.url);

  if (handlerData.endTimestamp && shouldCreateSpanResult) {
    const spanId = handlerData.fetchData.__span;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      endSpan(span, handlerData);

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return undefined;
  }

  const scope = getCurrentScope();
  const client = getClient();

  const { method, url } = handlerData.fetchData;

  const fullUrl = getFullURL(url);
  const host = fullUrl ? parseUrl(fullUrl).host : undefined;

  const hasParent = !!getActiveSpan();

  const span =
    shouldCreateSpanResult && hasParent
      ? startInactiveSpan({
          name: `${method} ${url}`,
          attributes: {
            url,
            type: 'fetch',
            'http.method': method,
            'http.url': fullUrl,
            'server.address': host,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: spanOrigin,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          },
        })
      : new SentryNonRecordingSpan();

  handlerData.fetchData.__span = span.spanContext().spanId;
  spans[span.spanContext().spanId] = span;

  if (shouldAttachHeaders(handlerData.fetchData.url) && client) {
    const request: string | Request = handlerData.args[0];

    // In case the user hasn't set the second argument of a fetch call we default it to `{}`.
    handlerData.args[1] = handlerData.args[1] || {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: { [key: string]: any } = handlerData.args[1];

    options.headers = addTracingHeadersToFetchRequest(
      request,
      client,
      scope,
      options,
      // If performance is disabled (TWP) or there's no active root span (pageload/navigation/interaction),
      // we do not want to use the span as base for the trace headers,
      // which means that the headers will be generated from the scope and the sampling decision is deferred
      hasTracingEnabled() && hasParent ? span : undefined,
    );
  }

  return span;
}

/**
 * Adds sentry-trace and baggage headers to the various forms of fetch headers
 */
export function addTracingHeadersToFetchRequest(
  request: string | unknown, // unknown is actually type Request but we can't export DOM types from this package,
  client: Client,
  scope: Scope,
  fetchOptionsObj: {
    headers?:
      | {
          [key: string]: string[] | string | undefined;
        }
      | PolymorphicRequestHeaders;
  },
  span?: Span,
): PolymorphicRequestHeaders | undefined {
  const isolationScope = getIsolationScope();

  const { traceId, spanId, sampled, dsc } = {
    ...isolationScope.getPropagationContext(),
    ...scope.getPropagationContext(),
  };

  const sentryTraceHeader = span ? spanToTraceHeader(span) : generateSentryTraceHeader(traceId, spanId, sampled);

  const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(
    dsc || (span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromClient(traceId, client)),
  );

  const headers =
    fetchOptionsObj.headers ||
    (typeof Request !== 'undefined' && isInstanceOf(request, Request) ? (request as Request).headers : undefined);

  if (!headers) {
    return { 'sentry-trace': sentryTraceHeader, baggage: sentryBaggageHeader };
  } else if (typeof Headers !== 'undefined' && isInstanceOf(headers, Headers)) {
    const newHeaders = new Headers(headers as Headers);

    newHeaders.set('sentry-trace', sentryTraceHeader);

    if (sentryBaggageHeader) {
      const prevBaggageHeader = newHeaders.get(BAGGAGE_HEADER_NAME);
      if (prevBaggageHeader) {
        const prevHeaderStrippedFromSentryBaggage = stripBaggageHeaderOfSentryBaggageValues(prevBaggageHeader);
        newHeaders.set(
          BAGGAGE_HEADER_NAME,
          // If there are non-sentry entries (i.e. if the stripped string is non-empty/truthy) combine the stripped header and sentry baggage header
          // otherwise just set the sentry baggage header
          prevHeaderStrippedFromSentryBaggage
            ? `${prevHeaderStrippedFromSentryBaggage},${sentryBaggageHeader}`
            : sentryBaggageHeader,
        );
      } else {
        newHeaders.set(BAGGAGE_HEADER_NAME, sentryBaggageHeader);
      }
    }

    return newHeaders as PolymorphicRequestHeaders;
  } else if (Array.isArray(headers)) {
    const newHeaders = [
      ...headers
        // Remove any existing sentry-trace headers
        .filter(header => {
          return !(Array.isArray(header) && header[0] === 'sentry-trace');
        })
        // Get rid of previous sentry baggage values in baggage header
        .map(header => {
          if (Array.isArray(header) && header[0] === BAGGAGE_HEADER_NAME && typeof header[1] === 'string') {
            const [headerName, headerValue, ...rest] = header;
            return [headerName, stripBaggageHeaderOfSentryBaggageValues(headerValue), ...rest];
          } else {
            return header;
          }
        }),
      // Attach the new sentry-trace header
      ['sentry-trace', sentryTraceHeader],
    ];

    if (sentryBaggageHeader) {
      // If there are multiple entries with the same key, the browser will merge the values into a single request header.
      // Its therefore safe to simply push a "baggage" entry, even though there might already be another baggage header.
      newHeaders.push([BAGGAGE_HEADER_NAME, sentryBaggageHeader]);
    }

    return newHeaders as PolymorphicRequestHeaders;
  } else {
    const existingBaggageHeader = 'baggage' in headers ? headers.baggage : undefined;
    let newBaggageHeaders: string[] = [];

    if (Array.isArray(existingBaggageHeader)) {
      newBaggageHeaders = existingBaggageHeader
        .map(headerItem =>
          typeof headerItem === 'string' ? stripBaggageHeaderOfSentryBaggageValues(headerItem) : headerItem,
        )
        .filter(headerItem => headerItem === '');
    } else if (existingBaggageHeader) {
      newBaggageHeaders.push(stripBaggageHeaderOfSentryBaggageValues(existingBaggageHeader));
    }

    if (sentryBaggageHeader) {
      newBaggageHeaders.push(sentryBaggageHeader);
    }

    return {
      ...(headers as Exclude<typeof headers, Headers>),
      'sentry-trace': sentryTraceHeader,
      baggage: newBaggageHeaders.length > 0 ? newBaggageHeaders.join(',') : undefined,
    };
  }
}

function getFullURL(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return undefined;
  }
}

function endSpan(span: Span, handlerData: HandlerDataFetch): void {
  if (handlerData.response) {
    setHttpStatus(span, handlerData.response.status);

    const contentLength =
      handlerData.response && handlerData.response.headers && handlerData.response.headers.get('content-length');

    if (contentLength) {
      const contentLengthNum = parseInt(contentLength);
      if (contentLengthNum > 0) {
        span.setAttribute('http.response_content_length', contentLengthNum);
      }
    }
  } else if (handlerData.error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
  span.end();
}

function stripBaggageHeaderOfSentryBaggageValues(baggageHeader: string): string {
  return (
    baggageHeader
      .split(',')
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .filter(baggageEntry => !baggageEntry.split('=')[0]!.startsWith(SENTRY_BAGGAGE_KEY_PREFIX))
      .join(',')
  );
}
