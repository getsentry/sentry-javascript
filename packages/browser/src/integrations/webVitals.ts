import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, hasSpansEnabled } from '@sentry/core';
import {
  startTrackingWebVitals,
  registerInpInteractionListener,
  trackClsAsSpan,
  trackInpAsSpan,
  trackLcpAsSpan,
} from '@sentry-internal/browser-utils';
import { DEBUG_BUILD } from '../debug-build';

type WebVitalName = 'lcp' | 'cls' | 'inp' | 'ttfb' | 'fp' | 'fcp';
type PageloadWebVitalName = Extract<WebVitalName, 'ttfb' | 'fp' | 'fcp'>;

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
  const disabledPageloadWebVitals = options.disable?.filter(isPageloadWebVitalName);

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if ((options.emit ?? 'spans') === 'spans' && !hasSpansEnabled(client.getOptions())) {
        DEBUG_BUILD &&
          debug.warn(
            '[WebVitals] webVitalsIntegration is configured to emit spans, but tracing is disabled. Set `tracesSampleRate` or `tracesSampler` to enable web vital spans.',
          );
      }

      startTrackingWebVitals({
        disable: disabledPageloadWebVitals,
      });

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

function isPageloadWebVitalName(vital: WebVitalName): vital is PageloadWebVitalName {
  return vital === 'ttfb' || vital === 'fp' || vital === 'fcp';
}
