import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe } from 'node:diagnostics_channel';
import type { Integration, IntegrationFn, SanitizedRequestData } from '@sentry/core';
import {
  addBreadcrumb,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getSanitizedUrlString,
  getTraceData,
  LRUMap,
  parseUrl,
  shouldPropagateTraceForUrl,
} from '@sentry/core';
import type { UndiciRequest, UndiciResponse } from '../../integrations/node-fetch/types';
import { mergeBaggageHeaders } from '../../utils/baggage';

const INTEGRATION_NAME = 'NodeFetch';

const SENTRY_TRACE_HEADER = 'sentry-trace';
const SENTRY_BAGGAGE_HEADER = 'baggage';

// For baggage, we make sure to merge this into a possibly existing header
const BAGGAGE_HEADER_REGEX = /baggage: (.*)\r\n/;

export interface NativeNodeFetchIntegrationOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture breadcrumbs or inject headers for outgoing fetch requests to URLs
   * where the given callback returns `true`.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const _nativeNodeFetchIntegration = ((options: NativeNodeFetchIntegrationOptions = {}) => {
  const _options = {
    breadcrumbs: options.breadcrumbs ?? true,
    ignoreOutgoingRequests: options.ignoreOutgoingRequests,
  };

  const propagationDecisionMap = new LRUMap<string, boolean>(100);
  const ignoreOutgoingRequestsMap = new WeakMap<UndiciRequest, boolean>();

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const onRequestCreated = ((_data: unknown) => {
        const data = _data as { request: UndiciRequest };
        onUndiciRequestCreated(data.request, _options, propagationDecisionMap, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      const onResponseHeaders = ((_data: unknown) => {
        const data = _data as { request: UndiciRequest; response: UndiciResponse };
        onUndiciResponseHeaders(data.request, data.response, _options, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      subscribe('undici:request:create', onRequestCreated);
      subscribe('undici:request:headers', onResponseHeaders);
    },
  };
}) satisfies IntegrationFn;

/**
 * This integration handles outgoing fetch (undici) requests in light mode (without OpenTelemetry).
 * It propagates trace headers and creates breadcrumbs for responses.
 */
export const nativeNodeFetchIntegration = _nativeNodeFetchIntegration as (
  options?: NativeNodeFetchIntegrationOptions,
) => Integration & {
  name: 'NodeFetch';
  setupOnce: () => void;
};

// eslint-disable-next-line complexity
function onUndiciRequestCreated(
  request: UndiciRequest,
  options: { ignoreOutgoingRequests?: (url: string) => boolean },
  propagationDecisionMap: LRUMap<string, boolean>,
  ignoreOutgoingRequestsMap: WeakMap<UndiciRequest, boolean>,
): void {
  const shouldIgnore = shouldIgnoreRequest(request, options);
  ignoreOutgoingRequestsMap.set(request, shouldIgnore);

  if (shouldIgnore) {
    return;
  }

  const url = getAbsoluteUrl(request.origin, request.path);

  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() || {};
  const addedHeaders = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
    ? getTraceData({ propagateTraceparent })
    : undefined;

  if (!addedHeaders) {
    return;
  }

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = addedHeaders;

  // Undici request headers can be either an array (v6) or a string (v5)
  if (Array.isArray(request.headers)) {
    const requestHeaders = request.headers;

    if (sentryTrace && !requestHeaders.includes(SENTRY_TRACE_HEADER)) {
      requestHeaders.push(SENTRY_TRACE_HEADER, sentryTrace);
    }

    if (traceparent && !requestHeaders.includes('traceparent')) {
      requestHeaders.push('traceparent', traceparent);
    }

    const existingBaggagePos = requestHeaders.findIndex(header => header === SENTRY_BAGGAGE_HEADER);
    if (baggage && existingBaggagePos === -1) {
      requestHeaders.push(SENTRY_BAGGAGE_HEADER, baggage);
    } else if (baggage) {
      const existingBaggage = requestHeaders[existingBaggagePos + 1];
      const merged = mergeBaggageHeaders(existingBaggage, baggage);
      if (merged) {
        requestHeaders[existingBaggagePos + 1] = merged;
      }
    }
  } else {
    const requestHeaders = request.headers;

    if (sentryTrace && !requestHeaders.includes(`${SENTRY_TRACE_HEADER}:`)) {
      request.headers += `${SENTRY_TRACE_HEADER}: ${sentryTrace}\r\n`;
    }

    if (traceparent && !requestHeaders.includes('traceparent:')) {
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

function onUndiciResponseHeaders(
  request: UndiciRequest,
  response: UndiciResponse,
  options: { breadcrumbs: boolean },
  ignoreOutgoingRequestsMap: WeakMap<UndiciRequest, boolean>,
): void {
  if (!options.breadcrumbs) {
    return;
  }

  const shouldIgnore = ignoreOutgoingRequestsMap.get(request);
  if (shouldIgnore) {
    return;
  }

  addFetchBreadcrumb(request, response);
}

/** Check if the given outgoing request should be ignored. */
function shouldIgnoreRequest(
  request: UndiciRequest,
  options: { ignoreOutgoingRequests?: (url: string) => boolean },
): boolean {
  const { ignoreOutgoingRequests } = options;

  if (!ignoreOutgoingRequests) {
    return false;
  }

  const url = getAbsoluteUrl(request.origin, request.path);
  return ignoreOutgoingRequests(url);
}

/** Add a breadcrumb for a fetch request. */
function addFetchBreadcrumb(request: UndiciRequest, response: UndiciResponse): void {
  const data = getFetchBreadcrumbData(request);
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

function getFetchBreadcrumbData(request: UndiciRequest): Partial<SanitizedRequestData> {
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

function getAbsoluteUrl(origin: string, path: string = '/'): string {
  try {
    const url = new URL(path, origin);
    return url.toString();
  } catch {
    const url = `${origin}`;

    if (url.endsWith('/') && path.startsWith('/')) {
      return `${url}${path.slice(1)}`;
    }

    if (!url.endsWith('/') && !path.startsWith('/')) {
      return `${url}/${path.slice(1)}`;
    }

    return `${url}${path}`;
  }
}
