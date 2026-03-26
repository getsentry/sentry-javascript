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

    const hasExistingSentryTraceHeader = requestHeaders.includes(SENTRY_TRACE_HEADER);

    // We do not want to set any headers if we already have an existing sentry-trace header.
    // This is still the source of truth, otherwise we risk mixing up baggage and sentry-trace values.
    if (!hasExistingSentryTraceHeader) {
      if (sentryTrace) {
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
    }
  } else {
    // We do not want to overwrite existing header here, if it was already set
    const hasExistingSentryTraceHeader = request.headers.includes(`${SENTRY_TRACE_HEADER}:`);

    if (!hasExistingSentryTraceHeader) {
      if (sentryTrace) {
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
  } else {
    const headersArray = request.headers.split('\r\n');
    const headers: string[] = [];
    for (const header of headersArray) {
      try {
        const [key, value] = header.split(':').map(part => part.trim());
        if (key != null && value != null) {
          headers.push(key, value);
        }
      } catch {
        continue;
      }
    }

    _deduplicateArrayHeaders(headers);

    const headerPairs: string[] = [];
    for (let i = 0; i < headers.length; i += 2) {
      headerPairs.push(`${headers[i]}: ${headers[i + 1]}`);
    }
    const concatenated = headerPairs.join('\r\n');
    if (concatenated) {
      request.headers = concatenated.concat('\r\n');
    }
  }
}

function _deduplicateArrayHeaders(headers: string[]): void {
  _deduplicateArrayHeader(headers, SENTRY_TRACE_HEADER);
  _deduplicateArrayHeader(headers, SENTRY_BAGGAGE_HEADER);
}

/**
 * For a given header name, if there are multiple entries in the [key, value, key, value, ...] array,
 * keep the first entry and remove the rest.
 * For baggage, values are merged to preserve all entries but to dedupe sentry- values, and always
 * keept the first occurance of them
 */
function _deduplicateArrayHeader(headers: string[], headerName: string): void {
  let firstIndex = -1;
  for (let i = 0; i < headers.length; i += 2) {
    if (headers[i] !== headerName) {
      continue;
    }

    if (firstIndex === -1) {
      firstIndex = i;
      continue;
    }

    if (headerName === SENTRY_BAGGAGE_HEADER) {
      // merge the initial entry into the later occurance so that we keep the initial sentry- values around.
      // all other non-sentry values are merged
      const merged = mergeBaggageHeaders(headers[i + 1] as string, headers[firstIndex + 1] as string);
      if (merged) {
        headers[firstIndex + 1] = merged;
      }
    }
    headers.splice(i, 2);
    i -= 2;
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
