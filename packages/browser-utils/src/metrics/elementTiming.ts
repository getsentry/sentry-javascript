import type { IntegrationFn } from '@sentry/core';
import { browserPerformanceTimeOrigin, defineIntegration, metrics } from '@sentry/core';
import { addPerformanceInstrumentationHandler } from './instrument';
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
            'sentry.origin': 'auto.ui.browser.element_timing',
            'ui.element.identifier': identifier,
          };

          if (paintType) {
            metricAttributes['ui.element.paint_type'] = paintType;
          }

          if (elementEntry.id) {
            metricAttributes['ui.element.id'] = elementEntry.id;
          }

          if (elementEntry.element) {
            metricAttributes['ui.element.type'] = elementEntry.element.tagName.toLowerCase();
          }

          if (elementEntry.url) {
            metricAttributes['ui.element.url'] = elementEntry.url;
          }

          if (elementEntry.naturalWidth) {
            metricAttributes['ui.element.width'] = elementEntry.naturalWidth;
          }

          if (elementEntry.naturalHeight) {
            metricAttributes['ui.element.height'] = elementEntry.naturalHeight;
          }

          if (renderTime) {
            metrics.distribution(`element_timing.render_time`, renderTime, {
              unit: 'millisecond',
              attributes: metricAttributes,
            });
          }

          if (loadTime) {
            metrics.distribution(`element_timing.load_time`, loadTime, {
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
 * This emits `element_timing.render_time` and `element_timing.load_time` (for images)
 * as distribution metrics, tagged with the element's identifier and paint type.
 */
export const elementTimingIntegration = defineIntegration(_elementTimingIntegration);

/**
 * @deprecated Use `elementTimingIntegration` instead. This function is a no-op and will be removed in a future version.
 */
export function startTrackingElementTiming(): () => void {
  return () => undefined;
}
