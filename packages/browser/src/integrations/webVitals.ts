import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, hasSpansEnabled } from '@sentry/core';
import { registerInpInteractionListener, startTrackingWebVitals } from '@sentry-internal/browser-utils';
import type { WebVitalName } from '@sentry-internal/browser-utils';
import { DEBUG_BUILD } from '../debug-build';

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
  disable?: WebVitalName[];
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
      if ((options.emit ?? 'spans') === 'spans' && !hasSpansEnabled(client.getOptions())) {
        DEBUG_BUILD &&
          debug.warn(
            '[WebVitals] webVitalsIntegration is configured to emit spans, but tracing is disabled. Set `tracesSampleRate` or `tracesSampler` to enable web vital spans.',
          );
      }

      startTrackingWebVitals(client, disabled);
    },
    afterAllSetup() {
      if (!disabled.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
