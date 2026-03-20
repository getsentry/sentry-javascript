import type { LRUMap, SanitizedRequestData } from '@sentry/core';
import {
  addBreadcrumb,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getSanitizedUrlString,
  getTraceData,
  parseUrl,
  shouldPropagateTraceForUrl,
} from '@sentry/core';
import type { UndiciRequest, UndiciResponse } from '../integrations/node-fetch/types';
import { mergeBaggageHeaders } from './baggage';

const SENTRY_TRACE_HEADER = 'sentry-trace';
const SENTRY_BAGGAGE_HEADER = 'baggage';

const BAGGAGE_HEADER_REGEX_GLOBAL = /baggage: (.*)\r\n/g;
const SENTRY_TRACE_HEADER_REGEX_GLOBAL = /sentry-trace: .*\r\n/g;

/**
 * Add trace propagation headers to an outgoing fetch/undici request.
 *
 * Checks if the request URL matches trace propagation targets,
 * then injects sentry-trace, traceparent, and baggage headers.
 */
// eslint-disable-next-line complexity
export function addTracePropagationHeadersToFetchRequest(
  request: UndiciRequest,
  propagationDecisionMap: LRUMap<string, boolean>,
): void {
  const url = getAbsoluteUrl(request.origin, request.path);

  // Manually add the trace headers, if it applies
  // Note: We do not use `propagation.inject()` here, because our propagator relies on an active span
  // Which we do not have in this case
  // The propagator _may_ overwrite this, but this should be fine as it is the same data
  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() || {};
  const addedHeaders = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
    ? getTraceData({ propagateTraceparent })
    : undefined;

  if (!addedHeaders) {
    return;
  }

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = addedHeaders;

  // We do not want to overwrite existing headers here
  // If the core UndiciInstrumentation is registered, it will already have set the headers
  // We do not want to add any then
  if (Array.isArray(request.headers)) {
    const requestHeaders = request.headers;

    // We do not want to overwrite existing header here, if it was already set
    if (sentryTrace && !requestHeaders.includes(SENTRY_TRACE_HEADER)) {
      requestHeaders.push(SENTRY_TRACE_HEADER, sentryTrace);
    }

    if (traceparent && !requestHeaders.includes('traceparent')) {
      requestHeaders.push('traceparent', traceparent);
    }

    // Consolidate all duplicate baggage entries into one, then merge with our new baggage.
    // OTel's UndiciInstrumentation may append a second baggage header via propagation.inject(),
    // so we need to handle multiple entries — not just the first one.
    const baggagePositions: number[] = [];
    for (let i = 0; i < requestHeaders.length; i++) {
      if (requestHeaders[i] === SENTRY_BAGGAGE_HEADER) {
        baggagePositions.push(i);
      }
    }

    if (baggage && !baggagePositions.length) {
      requestHeaders.push(SENTRY_BAGGAGE_HEADER, baggage);
    } else if (baggage) {
      // First, consolidate all existing baggage values into one
      let consolidatedBaggage = requestHeaders[baggagePositions[0]! + 1] as string;
      for (let i = baggagePositions.length - 1; i >= 1; i--) {
        const pos = baggagePositions[i]!;
        const val = requestHeaders[pos + 1] as string;
        consolidatedBaggage = mergeBaggageHeaders(consolidatedBaggage, val) || consolidatedBaggage;
        requestHeaders.splice(pos, 2);
      }

      // Then merge with the new baggage we want to add
      const merged = mergeBaggageHeaders(consolidatedBaggage, baggage);
      if (merged) {
        requestHeaders[baggagePositions[0]! + 1] = merged;
      }
    }

    // Also deduplicate sentry-trace headers — keep only the first occurrence.
    // OTel's UndiciInstrumentation may have appended a second one via propagation.inject().
    let firstSentryTraceFound = false;
    for (let i = requestHeaders.length - 2; i >= 0; i--) {
      if (requestHeaders[i] === SENTRY_TRACE_HEADER) {
        if (firstSentryTraceFound) {
          requestHeaders.splice(i, 2);
        }
        firstSentryTraceFound = true;
      }
    }
  } else {
    const requestHeaders = request.headers;
    // We do not want to overwrite existing header here, if it was already set
    if (sentryTrace && !requestHeaders.includes(`${SENTRY_TRACE_HEADER}:`)) {
      request.headers += `${SENTRY_TRACE_HEADER}: ${sentryTrace}\r\n`;
    }

    if (traceparent && !requestHeaders.includes('traceparent:')) {
      request.headers += `traceparent: ${traceparent}\r\n`;
    }

    // Consolidate all duplicate baggage entries into one, then merge with our new baggage.
    // OTel's UndiciInstrumentation may append a second baggage header via propagation.inject(),
    // so we need to handle multiple entries — not just the first one.
    const allBaggageMatches = request.headers.matchAll(BAGGAGE_HEADER_REGEX_GLOBAL);
    let consolidatedBaggage: string | undefined;
    for (const match of allBaggageMatches) {
      if (match[1]) {
        consolidatedBaggage = consolidatedBaggage
          ? mergeBaggageHeaders(consolidatedBaggage, match[1]) || consolidatedBaggage
          : match[1];
      }
    }

    // Remove all existing baggage entries
    request.headers = request.headers.replace(BAGGAGE_HEADER_REGEX_GLOBAL, '');

    if (baggage && !consolidatedBaggage) {
      request.headers += `${SENTRY_BAGGAGE_HEADER}: ${baggage}\r\n`;
    } else if (baggage && consolidatedBaggage) {
      const merged = mergeBaggageHeaders(consolidatedBaggage, baggage);
      if (merged) {
        request.headers += `${SENTRY_BAGGAGE_HEADER}: ${merged}\r\n`;
      }
    }

    // Deduplicate sentry-trace headers — keep only the first occurrence.
    let sentryTraceCount = 0;
    request.headers = request.headers.replace(SENTRY_TRACE_HEADER_REGEX_GLOBAL, match => {
      sentryTraceCount++;
      return sentryTraceCount === 1 ? match : '';
    });
  }
}

/** Add a breadcrumb for an outgoing fetch/undici request. */
export function addFetchRequestBreadcrumb(request: UndiciRequest, response: UndiciResponse): void {
  const data = getBreadcrumbData(request);

  const statusCode = response.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        ...data,
      },
      type: 'http',
      level,
    },
    {
      event: 'response',
      request,
      response,
    },
  );
}

function getBreadcrumbData(request: UndiciRequest): Partial<SanitizedRequestData> {
  try {
    const url = getAbsoluteUrl(request.origin, request.path);
    const parsedUrl = parseUrl(url);

    const data: Partial<SanitizedRequestData> = {
      url: getSanitizedUrlString(parsedUrl),
      'http.method': request.method || 'GET',
    };

    if (parsedUrl.search) {
      data['http.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      data['http.fragment'] = parsedUrl.hash;
    }

    return data;
  } catch {
    return {};
  }
}

/** Get the absolute URL from an origin and path. */
export function getAbsoluteUrl(origin: string, path: string = '/'): string {
  try {
    const url = new URL(path, origin);
    return url.toString();
  } catch {
    // fallback: Construct it on our own
    const url = `${origin}`;

    if (url.endsWith('/') && path.startsWith('/')) {
      return `${url}${path.slice(1)}`;
    }

    if (!url.endsWith('/') && !path.startsWith('/')) {
      return `${url}/${path}`;
    }

    return `${url}${path}`;
  }
}
