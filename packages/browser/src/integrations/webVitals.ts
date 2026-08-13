import type { IntegrationFn, Span } from '@sentry/core/browser';
import { defineIntegration, hasSpanStreamingEnabled } from '@sentry/core/browser';
import {
  addWebVitalsToSpan,
  enableSoftNavigationReporting,
  registerInpInteractionListener,
  startSoftNavigationCorrelation,
  startTrackingWebVitals,
  supportsSoftNavigations,
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

  /**
   * Also report LCP, CLS and INP for soft navigations, using the browser's
   * [Soft Navigations API](https://developer.chrome.com/docs/web-platform/soft-navigations-experiment)
   * (Chromium 151+).
   *
   * Each soft navigation gets its own set of vitals, reported against the navigation span it
   * belongs to. Turning this on also changes how the initial page load is measured: its vitals are
   * finalized at the first soft navigation rather than accumulating over the page's lifetime.
   *
   * Soft navigations the browser doesn't detect (programmatic navigations, navigations that never
   * paint) report no vitals at all, so coverage is lower than for page loads.
   *
   * Requires span streaming (`traceLifecycle: 'stream'`, the default), since soft navigation vitals
   * are finalized long after the navigation span they belong to has ended. Ignored in browsers
   * without support for the Soft Navigations API.
   *
   * Default: `false`
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

  return {
    name: WEB_VITALS_INTEGRATION_NAME,
    setup(client) {
      const spanStreamingEnabled = hasSpanStreamingEnabled(client);

      // Soft navigation vitals are finalized at the next soft navigation or on pagehide, long after
      // the navigation span they belong to has ended. Only span streaming can still send them.
      const reportSoftNavs = !!options.reportSoftNavs && spanStreamingEnabled && supportsSoftNavigations();

      if (reportSoftNavs) {
        // Has to run before any web vital observer is instrumented, since web-vitals only reads its
        // options when the observer is set up.
        enableSoftNavigationReporting();
        startSoftNavigationCorrelation(client);
      }

      // With span streaming enabled, CLS and LCP are tracked as standalone v2 spans (like INP).
      // Otherwise, they're recorded as measurements on the pageload span.
      const trackClsOnPageloadSpan = !spanStreamingEnabled && !ignored.has('cls');
      const trackLcpOnPageloadSpan = !spanStreamingEnabled && !ignored.has('lcp');

      const finalizeWebVitals = startTrackingWebVitals({
        trackCls: trackClsOnPageloadSpan,
        trackLcp: trackLcpOnPageloadSpan,
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
