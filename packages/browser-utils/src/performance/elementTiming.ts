import {
  SENTRY_ORIGIN,
  UI_ELEMENT_HEIGHT,
  UI_ELEMENT_ID,
  UI_ELEMENT_IDENTIFIER,
  UI_ELEMENT_PAINT_TYPE,
  UI_ELEMENT_TYPE,
  UI_ELEMENT_URL,
  UI_ELEMENT_WIDTH,
} from '@sentry/conventions/attributes';
import type { IntegrationFn } from '@sentry/core';
import { browserPerformanceTimeOrigin, defineIntegration, filterCollectedUrl, metrics } from '@sentry/core';
import { addPerformanceInstrumentationHandler } from '../instrumentation/performanceObserver';
import { getBrowserPerformanceAPI } from './utils';

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

const INTEGRATION_NAME = 'ElementTiming';

const _elementTimingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      const performance = getBrowserPerformanceAPI();
      if (!performance || !browserPerformanceTimeOrigin()) {
        return;
      }

      addPerformanceInstrumentationHandler('element', ({ entries }) => {
        for (const entry of entries) {
          const elementEntry = entry as PerformanceElementTiming;

          if (!elementEntry.identifier) {
            continue;
          }

          const identifier = elementEntry.identifier;
          const paintType = elementEntry.name as 'image-paint' | 'text-paint' | undefined;
          const renderTime = elementEntry.renderTime;
          const loadTime = elementEntry.loadTime;

          const metricAttributes: Record<string, string | number> = {
            [SENTRY_ORIGIN]: 'auto.ui.browser.element_timing',
            [UI_ELEMENT_IDENTIFIER]: identifier,
          };

          if (paintType) {
            metricAttributes[UI_ELEMENT_PAINT_TYPE] = paintType;
          }

          if (elementEntry.id) {
            metricAttributes[UI_ELEMENT_ID] = elementEntry.id;
          }

          if (elementEntry.element) {
            metricAttributes[UI_ELEMENT_TYPE] = elementEntry.element.tagName.toLowerCase();
          }

          if (elementEntry.url) {
            metricAttributes[UI_ELEMENT_URL] = filterCollectedUrl(elementEntry.url);
          }

          if (elementEntry.naturalWidth) {
            metricAttributes[UI_ELEMENT_WIDTH] = elementEntry.naturalWidth;
          }

          if (elementEntry.naturalHeight) {
            metricAttributes[UI_ELEMENT_HEIGHT] = elementEntry.naturalHeight;
          }

          if (renderTime > 0) {
            metrics.distribution(`ui.element.render_time`, renderTime, {
              unit: 'millisecond',
              attributes: metricAttributes,
            });
          }

          if (loadTime > 0) {
            metrics.distribution(`ui.element.load_time`, loadTime, {
              unit: 'millisecond',
              attributes: metricAttributes,
            });
          }
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures [Element Timing API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming)
 * data as Sentry metrics.
 *
 * To mark an element for tracking, add the `elementtiming` HTML attribute:
 * ```html
 * <img src="hero.jpg" elementtiming="hero-image" />
 * <p elementtiming="hero-text">Welcome!</p>
 * ```
 *
 * This emits `ui.element.render_time` and `ui.element.load_time` (for images)
 * as distribution metrics, tagged with the element's identifier and paint type.
 */
export const elementTimingIntegration = defineIntegration(_elementTimingIntegration);

/**
 * @deprecated Use `elementTimingIntegration` instead. This function is a no-op and will be removed in a future version.
 */
export function startTrackingElementTiming(): () => void {
  return () => undefined;
}
