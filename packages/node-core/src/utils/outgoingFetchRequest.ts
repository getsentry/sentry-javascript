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

// For baggage, we make sure to merge this into a possibly existing header
const BAGGAGE_HEADER_REGEX = /baggage: (.*)\r\n/;

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

  // OTel's UndiciInstrumentation calls propagation.inject() which unconditionally
  // appends headers to the request. When the user also sets headers via getTraceData(),
  // this results in duplicate sentry-trace and baggage entries.
  // We clean these up before applying our own logic.
  _deduplicateHeaders(request);

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

    // For baggage, we make sure to merge this into a possibly existing header
    const existingBaggagePos = requestHeaders.findIndex(header => header === SENTRY_BAGGAGE_HEADER);
    if (baggage && existingBaggagePos === -1) {
      requestHeaders.push(SENTRY_BAGGAGE_HEADER, baggage);
    } else if (baggage) {
      // headers in format [key_0, value_0, key_1, value_1, ...], hence the +1 here
      const existingBaggage = requestHeaders[existingBaggagePos + 1];
      const merged = mergeBaggageHeaders(existingBaggage, baggage);
      if (merged) {
        requestHeaders[existingBaggagePos + 1] = merged;
      }
    }
  } else {
    // We do not want to overwrite existing header here, if it was already set
    if (sentryTrace && !request.headers.includes(`${SENTRY_TRACE_HEADER}:`)) {
      request.headers += `${SENTRY_TRACE_HEADER}: ${sentryTrace}\r\n`;
    }

    if (traceparent && !request.headers.includes('traceparent:')) {
      request.headers += `traceparent: ${traceparent}\r\n`;
    }

    const existingBaggage = request.headers.match(BAGGAGE_HEADER_REGEX)?.[1];
    if (baggage && !existingBaggage) {
      request.headers += `${SENTRY_BAGGAGE_HEADER}: ${baggage}\r\n`;
    } else if (baggage) {
      const merged = mergeBaggageHeaders(existingBaggage, baggage);
      if (merged) {
        request.headers = request.headers.replace(BAGGAGE_HEADER_REGEX, `baggage: ${merged}\r\n`);
      }
    }
  }
}

/**
 * Remove duplicate sentry-trace and baggage headers from the request.
 *
 * OTel's UndiciInstrumentation unconditionally appends headers via propagation.inject(),
 * which can create duplicates when the user has already set these headers (e.g. via getTraceData()).
 * For sentry-trace, we keep the first occurrence (user-set).
 * For baggage, we merge all occurrences into one to preserve both sentry and non-sentry entries.
 */
function _deduplicateHeaders(request: UndiciRequest): void {
  if (Array.isArray(request.headers)) {
    _deduplicateArrayHeaders(request.headers);
  } else if (typeof request.headers === 'string') {
    request.headers = _deduplicateStringHeaders(request.headers);
  }
}

function _deduplicateArrayHeaders(headers: (string | string[])[]): void {
  _deduplicateArrayHeader(headers, SENTRY_TRACE_HEADER);
  _deduplicateArrayHeader(headers, SENTRY_BAGGAGE_HEADER);
}

/**
 * For a given header name, if there are multiple entries in the [key, value, key, value, ...] array,
 * keep the first entry and remove the rest.
 * For baggage, values are merged to preserve all entries. For other headers, the first value wins.
 */
function _deduplicateArrayHeader(headers: (string | string[])[], name: string): void {
  let firstPos = -1;
  for (let i = 0; i < headers.length; i += 2) {
    if (headers[i] !== name) {
      continue;
    }

    if (firstPos === -1) {
      firstPos = i;
      continue;
    }

    // Duplicate found after firstPos. Merge into firstPos and remove.
    if (name === SENTRY_BAGGAGE_HEADER) {
      const merged = mergeBaggageHeaders(headers[firstPos + 1] as string, headers[i + 1] as string);
      if (merged) {
        headers[firstPos + 1] = merged;
      }
    }
    headers.splice(i, 2);
    i -= 2;
  }
}

function _deduplicateStringHeaders(input: string): string {
  // Deduplicate sentry-trace — keep only the first occurrence
  let sentryTraceCount = 0;
  let result = input.replace(/sentry-trace: .*\r\n/g, match => {
    return ++sentryTraceCount === 1 ? match : '';
  });

  // Deduplicate baggage — merge all occurrences into one
  let mergedBaggage: string | undefined;
  result = result.replace(/baggage: (.*)\r\n/g, (_match, value: string) => {
    if (!mergedBaggage) {
      mergedBaggage = value;
    } else {
      mergedBaggage = mergeBaggageHeaders(mergedBaggage, value) || mergedBaggage;
    }
    return '';
  });

  if (mergedBaggage) {
    result += `${SENTRY_BAGGAGE_HEADER}: ${mergedBaggage}\r\n`;
  }

  return result;
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
