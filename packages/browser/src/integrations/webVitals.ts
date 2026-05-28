import type { Client, IntegrationFn } from '@sentry/core/browser';
import { defineIntegration } from '@sentry/core/browser';
import {
  registerInpInteractionListener,
  startTrackingINP,
  startTrackingWebVitals,
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
      collectWebVitalsCallbacks.set(
        client,
        startTrackingWebVitals({
          recordClsOnPageloadSpan: !disabled.has('cls'),
          recordLcpOnPageloadSpan: !disabled.has('lcp'),
        }),
      );

      if (!disabled.has('inp')) {
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
