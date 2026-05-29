import type { Client, IntegrationFn, Span } from '@sentry/core/browser';
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
  }>;
}

const collectWebVitalsCallbacks = new WeakMap<Client, (span: Span) => void>();

/**
 * Finalizes the collected web vitals and writes them onto the given (pageload) span.
 * Called by `browserTracingIntegration` when the pageload/navigation span ends.
 */
export function collectWebVitalsForClient(client: Client, span: Span): void {
  collectWebVitalsCallbacks.get(client)?.(span);
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
      const { enableStandaloneClsSpans, enableStandaloneLcpSpans } = options._experiments ?? {};

      const recordClsStandaloneSpans =
        spanStreamingEnabled || ignored.has('cls') ? undefined : enableStandaloneClsSpans || false;
      const recordLcpStandaloneSpans =
        spanStreamingEnabled || ignored.has('lcp') ? undefined : enableStandaloneLcpSpans || false;

      const finalizeWebVitals = startTrackingWebVitals({
        recordClsStandaloneSpans,
        recordLcpStandaloneSpans,
        client,
      });

      collectWebVitalsCallbacks.set(client, span => {
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
