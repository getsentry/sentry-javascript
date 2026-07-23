import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { IntegrationFn, Span, SpanAttributes, SpanAttributeValue } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  defineIntegration,
  getActiveSpan,
  getRootSpan,
  isPrimitive,
  spanToJSON,
  stringMatchesSomePattern,
} from '@sentry/core';
import { addPerformanceInstrumentationHandler } from './instrument';
import { msToSec, startAndEndSpan } from './utils';
import { getNavigationEntry } from './web-vitals/lib/getNavigationEntry';

interface UserTimingSpansOptions {
  /**
   * User Timing entries with names matching any of these strings or regular expressions will not be emitted.
   *
   * Default: []
   */
  ignore?: Array<string | RegExp>;
}

const INTEGRATION_NAME = 'UserTimingSpans';

const _userTimingSpansIntegration = ((options: UserTimingSpansOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      const timeOrigin = browserPerformanceTimeOrigin();
      if (!timeOrigin) {
        return;
      }
      const timeOriginInSeconds = msToSec(timeOrigin);

      const handleEntries = ({ entries }: { entries: PerformanceEntry[] }): void => {
        const activeSpan = getActiveSpan();
        if (!activeSpan) {
          return;
        }

        // Attach entries to the pageload/navigation root span rather than whatever child span happens to
        // be active when the browser reports them, so they consistently nest under the transaction.
        const rootSpan = getRootSpan(activeSpan);
        const { op: parentOp, start_timestamp: parentStartTimestamp } = spanToJSON(rootSpan);
        if (parentOp !== 'pageload' && parentOp !== 'navigation') {
          return;
        }

        // The navigation entry is stable for the lifetime of the document, so resolve it once per batch
        // rather than for every entry.
        const requestTime = msToSec(getNavigationEntry(false)?.requestStart ?? 0);

        for (const entry of entries) {
          const startTime = msToSec(entry.startTime);
          const absoluteStartTime = timeOriginInSeconds + startTime;

          if (parentOp === 'navigation' && parentStartTimestamp && absoluteStartTime < parentStartTimestamp) {
            continue;
          }

          _addUserTimingSpan(
            rootSpan,
            entry,
            startTime,
            msToSec(Math.max(0, entry.duration)),
            timeOriginInSeconds,
            requestTime,
            options.ignore ?? [],
          );
        }
      };

      addPerformanceInstrumentationHandler('mark', handleEntries);
      addPerformanceInstrumentationHandler('measure', handleEntries);
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures spans created with the browser's User Timing APIs, `performance.mark` and `performance.measure`.
 *
 * The integration must be explicitly added to `Sentry.init`. Entries are attached to the active pageload or
 * navigation span when the browser reports them through the PerformanceObserver API.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.browserTracingIntegration(),
 *     Sentry.userTimingSpansIntegration({
 *       ignore: ['third-party-mark', /framework-measure/],
 *     }),
 *   ],
 * });
 * ```
 */
export const userTimingSpansIntegration = defineIntegration(_userTimingSpansIntegration);

/**
 * Creates a span for a browser User Timing entry.
 * Exported only for tests.
 */
export function _addUserTimingSpan(
  parentSpan: Span,
  entry: PerformanceEntry,
  startTime: number,
  duration: number,
  timeOrigin: number,
  requestTime: number,
  ignore: Array<string | RegExp>,
): void {
  if (isReact19MeasureEntry(entry) || stringMatchesSomePattern(entry.name, ignore)) {
    return;
  }

  // Measures can reference arbitrary timestamps, including timestamps before the page request started.
  const spanStartTimestamp = timeOrigin + Math.max(startTime, requestTime);
  const originalStartTimestamp = timeOrigin + startTime;
  const spanEndTimestamp = originalStartTimestamp + duration;

  const attributes: SpanAttributes = {
    [SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
  };

  if (spanStartTimestamp !== originalStartTimestamp) {
    attributes['sentry.browser.measure_happened_before_request'] = true;
    attributes['sentry.browser.measure_start_time'] = spanStartTimestamp;
  }

  addDetailToSpanAttributes(attributes, entry as PerformanceMeasure);

  // Third-party measurements can contain timestamps which would produce invalid spans.
  if (spanStartTimestamp <= spanEndTimestamp) {
    startAndEndSpan(parentSpan, spanStartTimestamp, spanEndTimestamp, {
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
