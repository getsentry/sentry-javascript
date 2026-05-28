import type { Client, IntegrationFn } from '@sentry/core/browser';
import { defineIntegration, hasSpanStreamingEnabled } from '@sentry/core/browser';
import {
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
  disable?: WebVitalName[];
}

const collectWebVitalsCallbacks = new WeakMap<Client, () => void>();

export function collectWebVitalsForClient(client: Client): void {
  collectWebVitalsCallbacks.get(client)?.();
}

/**
 * Captures Core Web Vitals (LCP, CLS, INP) and related pageload vitals.
 *
 * `browserTracingIntegration` auto-registers this integration if no
 * `webVitalsIntegration` is already present, so explicit registration is only
 * needed to customize options or to use it without `browserTracingIntegration`.
 */
export const webVitalsIntegration = defineIntegration((options: WebVitalsOptions = {}) => {
  const disabled = new Set(options.disable ?? []);

  return {
    name: WEB_VITALS_INTEGRATION_NAME,
    setup(client) {
      const spanStreamingEnabled = hasSpanStreamingEnabled(client);

      collectWebVitalsCallbacks.set(
        client,
        startTrackingWebVitals({
          recordClsStandaloneSpans: spanStreamingEnabled || disabled.has('cls') ? undefined : false,
          recordLcpStandaloneSpans: spanStreamingEnabled || disabled.has('lcp') ? undefined : false,
          client,
        }),
      );

      if (spanStreamingEnabled) {
        if (!disabled.has('lcp')) {
          trackLcpAsSpan(client);
        }
        if (!disabled.has('cls')) {
          trackClsAsSpan(client);
        }
        if (!disabled.has('inp')) {
          trackInpAsSpan();
        }
      } else if (!disabled.has('inp')) {
        startTrackingINP();
      }
    },
    afterAllSetup() {
      if (!disabled.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
