import {
  browserPerformanceTimeOrigin,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { addPerformanceInstrumentationHandler } from './instrument';
import { getBrowserPerformanceAPI, msToSec } from './utils';

// ElementTiming interface based on the W3C spec
export interface PerformanceElementTiming extends PerformanceEntry {
  renderTime: number;
  loadTime: number;
  intersectionRect: DOMRectReadOnly;
  identifier: string;
  naturalWidth: number;
  naturalHeight: number;
  id: string;
  element: Element | null;
  url?: string;
}

/**
 * Start tracking ElementTiming performance entries.
 */
export function startTrackingElementTiming(): () => void {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin()) {
    return addPerformanceInstrumentationHandler('element', _onElementTiming);
  }

  return () => undefined;
}

/**
 * exported only for testing
 */
export const _onElementTiming = ({ entries }: { entries: PerformanceEntry[] }): void => {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
  const transactionName = rootSpan
    ? spanToJSON(rootSpan).description
    : getCurrentScope().getScopeData().transactionName;

  const timeOrigin = browserPerformanceTimeOrigin();
  if (!timeOrigin) {
    // If there's no reliable time origin, we might as well not record the spans here
    // as their data will be unreliable.
    return;
  }

  entries.forEach(entry => {
    const { naturalWidth, naturalHeight, url, identifier, name, renderTime, loadTime, startTime, id, element } =
      entry as PerformanceElementTiming;

    // Skip:
    // - entries without identifier (elementtiming attribute)
    // - entries without startTime (e.g. 3rd party Image nodes w/o Timing-Allow-Origin header returned instantly from cache)
    if (!identifier || !startTime) {
      return;
    }

    // Span durations
    // Case 1: Text nodes: point-in-time spans at `renderTime`
    // Case 2: Image nodes: spans from `loadTime` to `renderTime` (i.e. "effective render time")
    // Case 3: 3rd party Image nodes w/o Timing-Allow-Origin header: point-in-time spans at `loadTime`
    // Case 4: Both times are 0 is already covered by the `startTime` check above
    const relativeStartTime = loadTime > 0 ? loadTime : renderTime;
    const relativeEndTime = renderTime > 0 ? renderTime : loadTime;

    startSpan(
      {
        name: `element[${identifier}]`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.elementtiming',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.elementtiming',
          // name must be user-entered, so we can assume low cardinality
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          'sentry.transaction_name': transactionName,
          'ui.element.id': id,
          'ui.element.type': element?.tagName?.toLowerCase() || 'unknown',
          'ui.element.width': naturalWidth,
          'ui.element.height': naturalHeight,
          'ui.element.render_time': renderTime,
          'ui.element.load_time': loadTime,
          // `url` is `0`(number) for text paints (hence we fall back to undefined)
          'ui.element.url': url || undefined,
          'ui.element.identifier': identifier,
          // `name` contains the type of the element paint. Can be `'image-paint'` or `'text-paint'`.
          'ui.element.paint_type': name,
        },
        startTime: msToSec(timeOrigin + relativeStartTime),
        onlyIfParent: true,
      },
      span => {
        span.end(msToSec(timeOrigin + relativeEndTime));
      },
    );
  });
};
