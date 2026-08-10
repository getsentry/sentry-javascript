import type { IntegrationFn, Span } from '@sentry/core/browser';
import { defineIntegration } from '@sentry/core/browser';
import {
  addWebVitalsToSpan,
  registerInpInteractionListener,
  startTrackingWebVitals,
  trackClsAsSpan,
  trackInpAsSpan,
  trackLcpAsSpan,
} from '@sentry/browser-utils';

export const WEB_VITALS_INTEGRATION_NAME = 'WebVitals' as const;

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
      // CLS, LCP and INP are all tracked as their own streamed spans.
      const finalizeWebVitals = startTrackingWebVitals();

      const pageloadSpans = new WeakSet<Span>();

      client.on('afterStartPageLoadSpan', span => {
        pageloadSpans.add(span);
      });

      client.on('spanEnd', span => {
        if (!pageloadSpans.delete(span)) {
          return;
        }

        finalizeWebVitals();
        addWebVitalsToSpan(span);
      });

      if (!ignored.has('lcp')) {
        trackLcpAsSpan(client);
      }
      if (!ignored.has('cls')) {
        trackClsAsSpan(client);
      }
      if (!ignored.has('inp')) {
        trackInpAsSpan();
      }
    },
    afterAllSetup() {
      if (!ignored.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
