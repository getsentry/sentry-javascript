import type { IntegrationFn, Span } from '@sentry/core/browser';
import { debug, defineIntegration, hasSpanStreamingEnabled } from '@sentry/core/browser';
import {
  addWebVitalsToSpan,
  registerInpInteractionListener,
  startTrackingWebVitals,
  trackClsAsSpan,
  trackInpAsSpan,
  trackLcpAsSpan,
} from '@sentry/browser-utils';
import { DEBUG_BUILD } from '../debug-build';

export const WEB_VITALS_INTEGRATION_NAME = 'WebVitals' as const;

export type WebVitalName = 'cls' | 'inp' | 'lcp';

export interface WebVitalsOptions {
  /**
   * Web vitals to skip.
   */
  ignore?: WebVitalName[];

  /**
   * Experimental: report web vitals for Chrome soft navigations in addition to the initial pageload.
   * Requires the Soft Navigation API (origin trial or `#soft-navigation-heuristics` flag).
   */
  reportSoftNavs?: boolean;
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
  const reportSoftNavs = options.reportSoftNavs;

  return {
    name: WEB_VITALS_INTEGRATION_NAME,
    setup(client) {
      const spanStreamingEnabled = hasSpanStreamingEnabled(client);

      DEBUG_BUILD &&
        debug.log(
          `[SoftNav] webVitalsIntegration setup: spanStreamingEnabled=${spanStreamingEnabled}, reportSoftNavs=${!!reportSoftNavs}`,
        );

      // With span streaming enabled, CLS and LCP are tracked as standalone v2 spans (like INP).
      // Otherwise, they're recorded as measurements on the pageload span.
      const trackClsOnPageloadSpan = !spanStreamingEnabled && !ignored.has('cls');
      const trackLcpOnPageloadSpan = !spanStreamingEnabled && !ignored.has('lcp');

      const finalizeWebVitals = startTrackingWebVitals({
        trackCls: trackClsOnPageloadSpan,
        trackLcp: trackLcpOnPageloadSpan,
        reportSoftNavs,
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
          trackLcpAsSpan(client, reportSoftNavs);
        }
        if (!ignored.has('cls')) {
          trackClsAsSpan(client, reportSoftNavs);
        }
      }

      // INP is always sent as a streamed web vital span. When span streaming is disabled, INP still
      // streams (it overrides the static trace lifecycle for INP only), see `trackInpAsSpan`.
      if (!ignored.has('inp')) {
        trackInpAsSpan(client, reportSoftNavs);
      }
    },
    afterAllSetup() {
      if (!ignored.has('inp')) {
        registerInpInteractionListener();
      }
    },
  };
}) satisfies IntegrationFn;
