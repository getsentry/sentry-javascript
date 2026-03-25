import type { LRUMap, SanitizedRequestData } from '@sentry/core';
import {
  addBreadcrumb,
  debug,
  dynamicSamplingContextToSentryBaggageHeader,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  getSanitizedUrlString,
  getTraceData,
  isError,
  objectToBaggageHeader,
  parseBaggageHeader,
  parseUrl,
  SENTRY_BAGGAGE_KEY_PREFIX,
  shouldPropagateTraceForUrl,
} from '@sentry/core';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'http';
import { DEBUG_BUILD } from '../debug-build';
import { mergeBaggageHeaders } from './baggage';

const LOG_PREFIX = '@sentry/instrumentation-http';

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
  const url = getClientRequestUrl(request);

  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() || {};
  const headersToAdd = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
    ? getTraceData({ propagateTraceparent })
    : undefined;

  if (!headersToAdd) {
    return;
  }

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = headersToAdd;

  const hasExistingSentryTraceHeader = request.getHeader('sentry-trace');

  if (sentryTrace && !hasExistingSentryTraceHeader) {
    try {
      request.setHeader('sentry-trace', sentryTrace);
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'Added sentry-trace header to outgoing request');
    } catch (error) {
      DEBUG_BUILD &&
        debug.error(
          LOG_PREFIX,
          'Failed to add sentry-trace header to outgoing request:',
          isError(error) ? error.message : 'Unknown error',
        );
    }
  }

  if (traceparent && !hasExistingSentryTraceHeader && !request.getHeader('traceparent')) {
    try {
      request.setHeader('traceparent', traceparent);
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'Added traceparent header to outgoing request');
    } catch (error) {
      DEBUG_BUILD &&
        debug.error(
          LOG_PREFIX,
          'Failed to add traceparent header to outgoing request:',
          isError(error) ? error.message : 'Unknown error',
        );
    }
  }

  if (baggage && !hasExistingSentryTraceHeader) {
    const existingBaggage = request.getHeader('baggage');

    let cleanedExistingBaggage = existingBaggage;

    // In the edge case that a baggage header with sentry- keys was added
    // BUT NO sentry-trace header, we overwrite the sentry- keys in the header we attach.
    // Therefore, we clean the existing baggage header of all sentry- keys.
    if (existingBaggage) {
      const tmpBaggage = parseBaggageHeader(existingBaggage);
      const baggageWithoutSentry = tmpBaggage
        ? Object.fromEntries(Object.entries(tmpBaggage).filter(([key]) => !key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)))
        : {};
      cleanedExistingBaggage = objectToBaggageHeader(baggageWithoutSentry);
    }

    // If a sentry-trace header was already added, we don't add our baggage at all.
    const newBaggage = mergeBaggageHeaders(cleanedExistingBaggage, baggage);
    if (newBaggage) {
      try {
        request.setHeader('baggage', newBaggage);
        DEBUG_BUILD && debug.log(LOG_PREFIX, 'Added baggage header to outgoing request');
      } catch (error) {
        DEBUG_BUILD &&
          debug.error(
            LOG_PREFIX,
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

/**
 *
 */
export function getClientRequestUrl(request: ClientRequest): string {
  const hostname = request.getHeader('host') || request.host;
  const protocol = request.protocol;
  const path = request.path;

  return `${protocol}//${hostname}${path}`;
}
