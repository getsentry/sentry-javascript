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
const PREVIOUS_TRACE_KEY = 'sentry_previous_trace';

/**
 * Adds a previous_trace span link to @param startSpanOptions if the previous trace from @param previousTraceInfo is still valid.
 * Returns @param previousTraceInfo if the previous trace is still valid, otherwise returns undefined.
 */
export function addPreviousTraceSpanLink(
  previousTraceInfo: PreviousTraceInfo | undefined,
  span: Span,
): PreviousTraceInfo {
  if (previousTraceInfo && Date.now() / 1000 - previousTraceInfo.startTimestamp <= PREVIOUS_TRACE_MAX_DURATION) {
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
    const previousTraceInfo = WINDOW.sessionStorage.getItem(PREVIOUS_TRACE_KEY);
    // @ts-expect-error - intentionally risking JSON.parse throwing when previousTraceInfo is null to save bundle size
    return JSON.parse(previousTraceInfo);
  } catch (e) {
    return undefined;
  }
}
