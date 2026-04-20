import type { LRUMap } from '../../utils/lru';
import { getClient } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { isError } from '../../utils/is';
import { getTraceData } from '../../utils/traceData';
import { shouldPropagateTraceForUrl } from '../../utils/tracePropagationTargets';
import { LOG_PREFIX } from './constants';
import { getRequestUrlFromClientRequest } from './get-request-url';
import type { HttpClientRequest } from './types';
import { mergeBaggageHeaders } from '../../utils/baggage';

/**
 * Inject Sentry trace-propagation headers into an outgoing request if the
 * target URL matches the configured `tracePropagationTargets`.
 *
 * Note: this must be called *before* calling `request.end()` (or firing the
 * `http.client.request.start` diagnostics channel), because at that point,
 * the headers have already been sent, and cannot be modified.
 */
export function injectTracePropagationHeaders(
  request: HttpClientRequest,
  propagationDecisionMap: LRUMap<string, boolean>,
): void {
  const url = getRequestUrlFromClientRequest(request);
  const clientOptions = getClient()?.getOptions();
  const { tracePropagationTargets, propagateTraceparent } = clientOptions ?? {};

  if (!shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)) {
    return;
  }

  const hasExistingSentryTraceHeader = !!request.getHeader('sentry-trace');

  if (hasExistingSentryTraceHeader) {
    // add nothing if there's already a sentry-trace header,
    // or else baggage can be sent twice.
    return;
  }

  const traceData = getTraceData({ propagateTraceparent });
  if (!traceData) return;

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = traceData;

  if (sentryTrace) {
    try {
      request.setHeader('sentry-trace', sentryTrace);
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'Added sentry-trace header');
    } catch (e) {
      DEBUG_BUILD &&
        debug.error(LOG_PREFIX, 'Failed to set sentry-trace header:', isError(e) ? e.message : 'Unknown error');
    }
  }

  if (traceparent && !request.getHeader('traceparent')) {
    try {
      request.setHeader('traceparent', traceparent);
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'Added traceparent header');
    } catch (e) {
      DEBUG_BUILD &&
        debug.error(LOG_PREFIX, 'Failed to set traceparent header:', isError(e) ? e.message : 'Unknown error');
    }
  }

  if (baggage) {
    const merged = mergeBaggageHeaders(request.getHeader('baggage'), baggage);
    if (merged) {
      try {
        request.setHeader('baggage', merged);
        DEBUG_BUILD && debug.log(LOG_PREFIX, 'Added baggage header');
      } catch (e) {
        DEBUG_BUILD &&
          debug.error(LOG_PREFIX, 'Failed to set baggage header:', isError(e) ? e.message : 'Unknown error');
      }
    }
  }
}
