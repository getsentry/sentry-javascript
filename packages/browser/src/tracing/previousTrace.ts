import type { Span } from '@sentry/core';
import { logger, SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE, spanToJSON, type SpanContextData } from '@sentry/core';
import { WINDOW } from '../exports';
import { DEBUG_BUILD } from '../debug-build';

export interface PreviousTraceInfo {
  /**
   * Span context of the previous trace's local root span
   */
  spanContext: SpanContextData;

  /**
   * Timestamp in seconds when the previous trace was started
   */
  startTimestamp: number;
}

// 1h in seconds
export const PREVIOUS_TRACE_MAX_DURATION = 216_000;

// session storage key
export const PREVIOUS_TRACE_KEY = 'sentry_previous_trace';

/**
 * Adds a previous_trace span link to the passed span if the passed
 * previousTraceInfo is still valid.
 *
 * @returns the updated previous trace info (based on the current span/trace) to
 * be used on the next call
 */
export function addPreviousTraceSpanLink(
  previousTraceInfo: PreviousTraceInfo | undefined,
  span: Span,
): PreviousTraceInfo {
  const spanJson = spanToJSON(span);

  if (!previousTraceInfo) {
    return {
      spanContext: span.spanContext(),
      startTimestamp: spanJson.start_timestamp,
    };
  }

  if (previousTraceInfo.spanContext.traceId === spanJson.trace_id) {
    // This means, we're still in the same trace so let's not update the previous trace info
    // or add a link to the current span.
    // Once we move away from the long-lived, route-based trace model, we can remove this cases
    return previousTraceInfo;
  }

  if (Date.now() / 1000 - previousTraceInfo.startTimestamp <= PREVIOUS_TRACE_MAX_DURATION) {
    if (DEBUG_BUILD) {
      logger.info(
        `Adding previous_trace ${previousTraceInfo.spanContext} link to span ${{
          op: spanJson.op,
          ...span.spanContext(),
        }}`,
      );
    }

    span.addLink({
      context: previousTraceInfo.spanContext,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    });
  }

  return {
    spanContext: span.spanContext(),
    startTimestamp: spanToJSON(span).start_timestamp,
  };
}

/**
 * Stores @param previousTraceInfo in sessionStorage.
 */
export function storePreviousTraceInSessionStorage(previousTraceInfo: PreviousTraceInfo): void {
  try {
    WINDOW.sessionStorage.setItem(PREVIOUS_TRACE_KEY, JSON.stringify(previousTraceInfo));
  } catch (e) {
    // Ignore potential errors (e.g. if sessionStorage is not available)
    DEBUG_BUILD && logger.warn('Could not store previous trace in sessionStorage', e);
  }
}

/**
 * Retrieves the previous trace from sessionStorage if available.
 */
export function getPreviousTraceFromSessionStorage(): PreviousTraceInfo | undefined {
  try {
    const previousTraceInfo = WINDOW.sessionStorage?.getItem(PREVIOUS_TRACE_KEY);
    // @ts-expect-error - intentionally risking JSON.parse throwing when previousTraceInfo is null to save bundle size
    return JSON.parse(previousTraceInfo);
  } catch (e) {
    return undefined;
  }
}
