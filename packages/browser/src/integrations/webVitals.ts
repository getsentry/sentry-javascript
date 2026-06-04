import type { IntegrationFn, Span } from '@sentry/core/browser';
import { defineIntegration, hasSpanStreamingEnabled } from '@sentry/core/browser';
import {
  addWebVitalsToSpan,
  registerInpInteractionListener,
  startTrackingINP,
  startTrackingWebVitals,
  trackInpAsSpan,
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

      const trackCls = !ignored.has('cls');
      const trackLcp = !ignored.has('lcp');

      const finalizeWebVitals = startTrackingWebVitals({
        trackCls,
        trackLcp,
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
          recordClsOnPageloadSpan: trackCls,
          recordLcpOnPageloadSpan: trackLcp,
          spanStreamingEnabled,
        });
      });

      if (spanStreamingEnabled) {
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
