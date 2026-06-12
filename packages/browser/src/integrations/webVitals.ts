import type { IntegrationFn, Span } from '@sentry/core/browser';
import { defineIntegration, hasSpanStreamingEnabled } from '@sentry/core/browser';
import {
  addWebVitalsToSpan,
  registerInpInteractionListener,
  startTrackingINP,
  startTrackingWebVitals,
  trackClsAsSpan,
  trackInpAsSpan,
  trackLcpAsSpan,
} from '@sentry/browser-utils';

export const WEB_VITALS_INTEGRATION_NAME = 'WebVitals';

export type WebVitalName = 'cls' | 'inp' | 'lcp';

export interface WebVitalsOptions {
  /**
   * Web vitals to skip.
   */
  ignore?: WebVitalName[];
}

/**
 * Captures Core Web Vitals (LCP, CLS, INP) and related pageload vitals.
 *
 * `browserTracingIntegration` auto-registers this integration if no
 * `webVitalsIntegration` is already present, so explicit registration is only
 * needed to customize options or to use it without `browserTracingIntegration`.
 */
export const webVitalsIntegration = defineIntegration((options: WebVitalsOptions = {}) => {
  const ignored = new Set(options.ignore ?? []);

  return {
    name: WEB_VITALS_INTEGRATION_NAME,
    setup(client) {
      const spanStreamingEnabled = hasSpanStreamingEnabled(client);

      // With span streaming enabled, CLS and LCP are tracked as standalone v2 spans (like INP).
      // Otherwise, they're recorded as measurements on the pageload span.
      const trackClsOnPageloadSpan = !spanStreamingEnabled && !ignored.has('cls');
      const trackLcpOnPageloadSpan = !spanStreamingEnabled && !ignored.has('lcp');

      const finalizeWebVitals = startTrackingWebVitals({
        trackCls: trackClsOnPageloadSpan,
        trackLcp: trackLcpOnPageloadSpan,
        client,
      });

      const pageloadSpans = new WeakSet<Span>();

      client.on('afterStartPageLoadSpan', span => {
        pageloadSpans.add(span);
      });

      client.on('spanEnd', span => {
        if (!pageloadSpans.delete(span)) {
          return;
        }

        finalizeWebVitals();
        addWebVitalsToSpan(span, {
          recordClsOnPageloadSpan: trackClsOnPageloadSpan,
          recordLcpOnPageloadSpan: trackLcpOnPageloadSpan,
          spanStreamingEnabled,
        });
      });

      if (spanStreamingEnabled) {
        if (!ignored.has('lcp')) {
          trackLcpAsSpan(client);
        }
        if (!ignored.has('cls')) {
          trackClsAsSpan(client);
        }
        if (!ignored.has('inp')) {
          trackInpAsSpan();
        }
      } else if (!ignored.has('inp')) {
        startTrackingINP();
      }
    },
    afterAllSetup() {
      if (!ignored.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
