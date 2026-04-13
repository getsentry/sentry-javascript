import type { LRUMap } from '../../utils/lru';
import { getClient } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { isError } from '../../utils/is';
import { getTraceData } from '../../utils/traceData';
import { shouldPropagateTraceForUrl } from '../../utils/tracePropagationTargets';
import { LOG_PREFIX } from './constants';
import { getRequestUrl } from './get-request-url';
import { mergeBaggage } from './merge-baggage';
import type { HttpClientRequest } from './types';

/**
 * Inject Sentry trace-propagation headers into an outgoing request if the
 * target URL matches the configured `tracePropagationTargets`.
 */
export function injectTracePropagationHeaders(
  request: HttpClientRequest,
  propagationDecisionMap: LRUMap<string, boolean>,
): void {
  const url = getRequestUrl(request);
  const clientOptions = getClient()?.getOptions();
  const { tracePropagationTargets, propagateTraceparent } = clientOptions ?? {};

  if (!shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)) {
    return;
  }

  const traceData = getTraceData({ propagateTraceparent });
  if (!traceData) return;

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = traceData;

  if (sentryTrace && !request.getHeader('sentry-trace')) {
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
    const merged = mergeBaggage(request.getHeader('baggage'), baggage);
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
