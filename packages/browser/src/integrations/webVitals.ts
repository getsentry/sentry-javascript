import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import {
  registerInpInteractionListener,
  trackClsAsSpan,
  trackInpAsSpan,
  trackLcpAsSpan,
} from '@sentry-internal/browser-utils';

interface WebVitalsOptions {
  /**
   * How web vitals are emitted.
   *
   * - `'spans'`: emits LCP, CLS and INP as streamed web vital spans (default).
   *
   * @default 'spans'
   */
  emit?: 'spans';

  /**
   * Web vitals to skip. Useful as a migration path for users who previously
   * disabled a single vital (e.g. `enableInp: false` on `browserTracingIntegration`).
   *
   * @default []
   */
  disable?: Array<'lcp' | 'cls' | 'inp'>;
}

export const INTEGRATION_NAME = 'WebVitals';

/**
 * Captures Core Web Vitals (LCP, CLS, INP) and emits them as streamed spans.
 *
 * `browserTracingIntegration` auto-registers this integration if no
 * `webVitalsIntegration` is already present, so explicit registration is only
 * needed to customize options or to use it without `browserTracingIntegration`.
 */
export const webVitalsIntegration = defineIntegration((options: WebVitalsOptions = {}) => {
  const disabled = new Set(options.disable ?? []);

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (!disabled.has('lcp')) {
        trackLcpAsSpan(client);
      }
      if (!disabled.has('cls')) {
        trackClsAsSpan(client);
      }
      if (!disabled.has('inp')) {
        trackInpAsSpan();
      }
    },
    afterAllSetup() {
      if (!disabled.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
