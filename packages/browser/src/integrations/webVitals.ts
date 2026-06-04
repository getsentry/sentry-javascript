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
} from '@sentry-internal/browser-utils';

export const WEB_VITALS_INTEGRATION_NAME = 'WebVitals';

export type WebVitalName = 'cls' | 'inp' | 'lcp';

export interface WebVitalsOptions {
  /**
   * Web vitals to skip.
   */
  ignore?: WebVitalName[];

  /**
   * @experimental
   */
  _experiments?: Partial<{
    enableStandaloneClsSpans: boolean;
    enableStandaloneLcpSpans: boolean;
    enableSoftNavWebVitals: boolean;
  }>;
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
      const { enableStandaloneClsSpans, enableStandaloneLcpSpans, enableSoftNavWebVitals } = options._experiments ?? {};

      const recordClsStandaloneSpans =
        spanStreamingEnabled || ignored.has('cls') ? undefined : enableStandaloneClsSpans || false;
      const recordLcpStandaloneSpans =
        spanStreamingEnabled || ignored.has('lcp') ? undefined : enableStandaloneLcpSpans || false;

      const finalizeWebVitals = startTrackingWebVitals({
        recordClsStandaloneSpans,
        recordLcpStandaloneSpans,
        reportSoftNavs: enableSoftNavWebVitals,
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
          // CLS/LCP are recorded as pageload span measurements only when they're neither
          // tracked as standalone spans nor handled by span streaming (and not ignored).
          recordClsOnPageloadSpan: recordClsStandaloneSpans === false,
          recordLcpOnPageloadSpan: recordLcpStandaloneSpans === false,
          spanStreamingEnabled,
        });
      });

      if (spanStreamingEnabled) {
        if (!ignored.has('lcp')) {
          trackLcpAsSpan(client, enableSoftNavWebVitals);
        }
        if (!ignored.has('cls')) {
          trackClsAsSpan(client, enableSoftNavWebVitals);
        }
        if (!ignored.has('inp')) {
          trackInpAsSpan(enableSoftNavWebVitals);
        }
      } else if (!ignored.has('inp')) {
        startTrackingINP(enableSoftNavWebVitals);
      }
    },
    afterAllSetup() {
      if (!ignored.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
