import type { LRUMap, SanitizedRequestData } from '@sentry/core';
import {
  addBreadcrumb,
  debug,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getSanitizedUrlString,
  getTraceData,
  isError,
  parseUrl,
} from '@sentry/core';
import { shouldPropagateTraceForUrl } from '@sentry/opentelemetry';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'http';
import { DEBUG_BUILD } from '../../debug-build';
import { mergeBaggageHeaders } from '../../utils/baggage';
import { INSTRUMENTATION_NAME } from './constants';

/** Add a breadcrumb for outgoing requests. */
export function addRequestBreadcrumb(request: ClientRequest, response: IncomingMessage | undefined): void {
  const data = getBreadcrumbData(request);

  const statusCode = response?.statusCode;
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

/**
 * Add trace propagation headers to an outgoing request.
 * This must be called _before_ the request is sent!
 */
// eslint-disable-next-line complexity
export function addTracePropagationHeadersToOutgoingRequest(
  request: ClientRequest,
  propagationDecisionMap: LRUMap<string, boolean>,
): void {
  const url = getRequestUrl(request);

  // Manually add the trace headers, if it applies
  // Note: We do not use `propagation.inject()` here, because our propagator relies on an active span
  // Which we do not have in this case
  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() || {};
  const headersToAdd = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
    ? getTraceData({ propagateTraceparent })
    : undefined;

  if (!headersToAdd) {
    return;
  }

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = headersToAdd;

  // We do not want to overwrite existing header here, if it was already set
  if (sentryTrace && !request.getHeader('sentry-trace')) {
    try {
      request.setHeader('sentry-trace', sentryTrace);
      DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Added sentry-trace header to outgoing request');
    } catch (error) {
      DEBUG_BUILD &&
        debug.error(
          INSTRUMENTATION_NAME,
          'Failed to add sentry-trace header to outgoing request:',
          isError(error) ? error.message : 'Unknown error',
        );
    }
  }

  if (traceparent && !request.getHeader('traceparent')) {
    try {
      request.setHeader('traceparent', traceparent);
      DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Added traceparent header to outgoing request');
    } catch (error) {
      DEBUG_BUILD &&
        debug.error(
          INSTRUMENTATION_NAME,
          'Failed to add traceparent header to outgoing request:',
          isError(error) ? error.message : 'Unknown error',
        );
    }
  }

  if (baggage) {
    // For baggage, we make sure to merge this into a possibly existing header
    const newBaggage = mergeBaggageHeaders(request.getHeader('baggage'), baggage);
    if (newBaggage) {
      try {
        request.setHeader('baggage', newBaggage);
        DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Added baggage header to outgoing request');
      } catch (error) {
        DEBUG_BUILD &&
          debug.error(
            INSTRUMENTATION_NAME,
            'Failed to add baggage header to outgoing request:',
            isError(error) ? error.message : 'Unknown error',
          );
      }
    }
  }
}

function getBreadcrumbData(request: ClientRequest): Partial<SanitizedRequestData> {
  try {
    // `request.host` does not contain the port, but the host header does
    const host = request.getHeader('host') || request.host;
    const url = new URL(request.path, `${request.protocol}//${host}`);
    const parsedUrl = parseUrl(url.toString());

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

/** Convert an outgoing request to request options. */
export function getRequestOptions(request: ClientRequest): RequestOptions {
  return {
    method: request.method,
    protocol: request.protocol,
    host: request.host,
    hostname: request.host,
    path: request.path,
    headers: request.getHeaders(),
  };
}

function getRequestUrl(request: ClientRequest): string {
  const hostname = request.getHeader('host') || request.host;
  const protocol = request.protocol;
  const path = request.path;

  return `${protocol}//${hostname}${path}`;
}
