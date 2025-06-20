import type { SpanAttributes } from '@sentry/core';
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
  timestampInSeconds,
} from '@sentry/core';
import { addPerformanceInstrumentationHandler } from './instrument';
import { getBrowserPerformanceAPI, msToSec } from './utils';

// ElementTiming interface based on the W3C spec
interface PerformanceElementTiming extends PerformanceEntry {
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

  entries.forEach(entry => {
    const elementEntry = entry as PerformanceElementTiming;

    // Skip entries without identifier (elementtiming attribute)
    if (!elementEntry.identifier) {
      return;
    }

    // `name` contains the type of the element paint. Can be `'image-paint'` or `'text-paint'`.
    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming#instance_properties
    const paintType = elementEntry.name as 'image-paint' | 'text-paint' | undefined;

    const renderTime = elementEntry.renderTime;
    const loadTime = elementEntry.loadTime;

    // starting the span at:
    // - `loadTime` if available (should be available for all "image-paint" entries, 0 otherwise)
    // - `renderTime` if available (available for all entries, except 3rd party images, but these should be covered by `loadTime`, 0 otherwise)
    // - `timestampInSeconds()` as a safeguard
    // see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming/renderTime#cross-origin_image_render_time
    const [spanStartTime, spanStartTimeSource] = loadTime
      ? [msToSec(loadTime), 'load-time']
      : renderTime
        ? [msToSec(renderTime), 'render-time']
        : [timestampInSeconds(), 'entry-emission'];

    const duration =
      paintType === 'image-paint'
        ? // for image paints, we can acually get a duration because image-paint entries also have a `loadTime`
          // and `renderTime`. `loadTime` is the time when the image finished loading and `renderTime` is the
          // time when the image finished rendering.
          msToSec(Math.max(0, (renderTime ?? 0) - (loadTime ?? 0)))
        : // for `'text-paint'` entries, we can't get a duration because the `loadTime` is always zero.
          0;

    const attributes: SpanAttributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.elementtiming',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.elementtiming',
      // name must be user-entered, so we can assume low cardinality
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
      // recording the source of the span start time, as it varies depending on available data
      'sentry.span_start_time_source': spanStartTimeSource,
      'sentry.transaction_name': transactionName,
      'element.id': elementEntry.id,
      'element.type': elementEntry.element?.tagName?.toLowerCase() || 'unknown',
      'element.size':
        elementEntry.naturalWidth && elementEntry.naturalHeight
          ? `${elementEntry.naturalWidth}x${elementEntry.naturalHeight}`
          : undefined,
      'element.render_time': renderTime,
      'element.load_time': loadTime,
      // `url` is `0`(number) for text paints (hence we fall back to undefined)
      'element.url': elementEntry.url || undefined,
      'element.identifier': elementEntry.identifier,
      'element.paint_type': paintType,
    };

    startSpan(
      {
        name: `element[${elementEntry.identifier}]`,
        attributes,
        startTime: spanStartTime,
        onlyIfParent: true,
      },
      span => {
        span.end(spanStartTime + duration);
      },
    );
  });
};
