import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { IntegrationFn, Span, SpanAttributes, SpanAttributeValue } from '@sentry/core';
import {
  defineIntegration,
  isPrimitive,
  performanceTimeToSeconds,
  spanToJSON,
  stringMatchesSomePattern,
} from '@sentry/core';
import { getBrowserPerformanceAPI, startAndEndSpan } from './utils';
import { getNavigationEntry } from '../web-vitals/utils';

interface UserTimingOptions {
  /**
   * User Timing entries with names matching any of these strings or regular expressions will not be emitted.
   *
   * Default: []
   */
  ignore?: Array<string | RegExp>;
}

const INTEGRATION_NAME = 'UserTiming';

const _userTimingIntegration = ((options: UserTimingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const performance = getBrowserPerformanceAPI();
      if (!performance?.getEntries) {
        return;
      }
      let performanceCursor = 0;

      client.on('beforeIdleSpanEnd', idleSpan => {
        const { attributes, start_timestamp: parentStartTimestamp } = spanToJSON(idleSpan);
        const parentOp = attributes[SENTRY_OP];

        if (parentOp !== 'pageload' && parentOp !== 'navigation') {
          return;
        }

        const requestStart = getNavigationEntry(false)?.requestStart ?? 0;
        const performanceEntries = performance.getEntries();

        for (const entry of performanceEntries.slice(performanceCursor)) {
          if (entry.entryType !== 'mark' && entry.entryType !== 'measure') {
            continue;
          }

          const startTimestamp = performanceTimeToSeconds(entry.startTime);
          if (!startTimestamp) {
            continue;
          }

          if (parentOp === 'navigation' && parentStartTimestamp && startTimestamp < parentStartTimestamp) {
            continue;
          }

          const endTimestamp = performanceTimeToSeconds(
            entry.startTime + Math.max(0, entry.duration),
            entry.startTime,
          ) as number;

          // We convert the request start with the entry's time origin, so that the clamp in `_addUserTimingSpan` compares
          // timestamps on the same timeline, even if the time origin was corrected between the request and the entry.
          const requestTimestamp = performanceTimeToSeconds(requestStart, entry.startTime) as number;

          _addUserTimingSpan(idleSpan, entry, startTimestamp, endTimestamp, requestTimestamp, options.ignore ?? []);
        }

        performanceCursor = performanceEntries.length;
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures spans created with the browser's User Timing APIs, `performance.mark` and `performance.measure`.
 *
 * The integration must be explicitly added to `Sentry.init`. Entries are attached to the active pageload or
 * navigation span when it ends.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.browserTracingIntegration(),
 *     Sentry.userTimingIntegration({
 *       ignore: ['third-party-mark', /framework-measure/],
 *     }),
 *   ],
 * });
 * ```
 */
export const userTimingIntegration = defineIntegration(_userTimingIntegration);

/**
 * Creates a span for a browser User Timing entry.
 * Exported only for tests.
 */
export function _addUserTimingSpan(
  parentSpan: Span,
  entry: PerformanceEntry,
  startTimestamp: number,
  endTimestamp: number,
  requestTimestamp: number,
  ignore: Array<string | RegExp>,
): void {
  if (isReact19MeasureEntry(entry) || stringMatchesSomePattern(entry.name, ignore)) {
    return;
  }

  // Measures can reference arbitrary timestamps, including timestamps before the page request started.
  const spanStartTimestamp = Math.max(startTimestamp, requestTimestamp);

  const attributes: SpanAttributes = {
    [SENTRY_ORIGIN]: `auto.browser.user_timing.${entry.entryType}`,
  };

  if (spanStartTimestamp !== startTimestamp) {
    attributes['sentry.browser.measure_happened_before_request'] = true;
    attributes['sentry.browser.measure_start_time'] = spanStartTimestamp;
  }

  addDetailToSpanAttributes(attributes, entry as PerformanceMeasure);

  // Third-party measurements can contain timestamps which would produce invalid spans.
  if (spanStartTimestamp <= endTimestamp) {
    startAndEndSpan(parentSpan, spanStartTimestamp, endTimestamp, {
      name: entry.name,
      op: entry.entryType,
      attributes,
    });
  }
}

/**
 * React 19.2+ creates performance.measure entries for component renders.
 * We can identify them by the `detail.devtools.track` property being set to 'Components ⚛'.
 * See https://react.dev/reference/dev-tools/react-performance-tracks.
 */
function isReact19MeasureEntry(entry: PerformanceEntry): boolean | void {
  if (entry.entryType !== 'measure') {
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (entry as PerformanceMeasure).detail.devtools.track === 'Components ⚛';
  } catch {
    return;
  }
}

function addDetailToSpanAttributes(attributes: SpanAttributes, entry: PerformanceMeasure): void {
  try {
    // Accessing detail can throw in some browsers due to security restrictions.
    const detail = entry.detail;
    if (!detail) {
      return;
    }

    if (typeof detail === 'object') {
      for (const [key, value] of Object.entries(detail)) {
        if (value && isPrimitive(value)) {
          attributes[`sentry.browser.measure.detail.${key}`] = value as SpanAttributeValue;
        } else if (value !== undefined) {
          try {
            attributes[`sentry.browser.measure.detail.${key}`] = JSON.stringify(value);
          } catch {
            // User-provided detail values are not guaranteed to be serializable.
          }
        }
      }
      return;
    }

    if (isPrimitive(detail)) {
      attributes['sentry.browser.measure.detail'] = detail as SpanAttributeValue;
      return;
    }

    try {
      attributes['sentry.browser.measure.detail'] = JSON.stringify(detail);
    } catch {
      // User-provided detail values are not guaranteed to be serializable.
    }
  } catch {
    // Accessing detail can throw in some browsers due to security restrictions.
  }
}
