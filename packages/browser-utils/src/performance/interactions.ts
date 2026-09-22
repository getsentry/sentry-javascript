import {
  HTTP_ROUTE,
  SENTRY_DESCRIPTION,
  SENTRY_IDLE_SPAN_FINISH_REASON,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME,
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_SOURCE,
  UI_COMPONENT_NAME,
  URL_FULL,
  URL_PATH,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { UI_ACTION_CLICK, UI_INTERACTION_CLICK } from '@sentry/conventions/op';
import type { Client, IntegrationFn, Span, StartSpanOptions, TransactionSource } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  defineIntegration,
  filterCollectedUrl,
  getActiveSpan,
  getRootSpan,
  hasSpanStreamingEnabled,
  spanToJSON,
  UI_ACTION_CLICK_SPAN_NAME_FALLBACK,
  UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK,
} from '@sentry/core';
import { startIdleSpan } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { htmlTreeAsString } from '../htmlTreeAsString';
import { addPerformanceInstrumentationHandler } from '../instrumentation/performanceObserver';
import { isBotUserAgent } from '../isBotUserAgent';
import { WINDOW } from '../types';
import { msToSec, startAndEndSpan } from './utils';
import { getComponentName } from '../component-name';

const INTEGRATION_NAME = 'Interactions';

interface InteractionsOptions {
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the interaction span will finish.
   *
   * Default: 1000 (ms)
   */
  idleTimeout?: number;

  /**
   * The max. time an interaction span may run.
   * If this time is exceeded, the interaction span will finish no matter what.
   *
   * Default: 30000 (ms)
   */
  finalTimeout?: number;

  /**
   * The max. time a child span of an interaction span may run.
   * If this time is exceeded, the interaction span will finish no matter what.
   *
   * Default: 15000 (ms)
   */
  childSpanTimeout?: number;
}

interface RouteInfo {
  name: string | undefined;
  source: TransactionSource | undefined;
  urlTemplate: string | undefined;
  httpRoute: string | undefined;
  urlPath: string | undefined;
  urlFull: string | undefined;
}

const _interactionsIntegration = ((options: InteractionsOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (isBotUserAgent()) {
        return;
      }

      const latestRoute: RouteInfo = {
        name: undefined,
        source: undefined,
        urlTemplate: undefined,
        httpRoute: undefined,
        urlPath: undefined,
        urlFull: undefined,
      };
      // The pageload/navigation span that is currently in progress, if any. Clicks that happen while one
      // is open are not turned into interaction spans, as they'd compete with the route span for children.
      let inflightRouteSpan: Span | undefined;

      function trackRoute(span: Span): void {
        const { name, attributes } = spanToJSON(span);
        latestRoute.name = name;
        // oxlint-disable-next-line typescript/no-deprecated
        latestRoute.source = (attributes[SENTRY_SOURCE] || attributes[SENTRY_SEGMENT_NAME_SOURCE]) as
          | TransactionSource
          | undefined;
        latestRoute.urlTemplate = attributes[URL_TEMPLATE] as string | undefined;
        latestRoute.httpRoute = attributes[HTTP_ROUTE] as string | undefined;
        latestRoute.urlPath = attributes[URL_PATH] as string | undefined;
        latestRoute.urlFull = attributes[URL_FULL] as string | undefined;
      }

      client.on('spanStart', span => {
        if (isRouteSpan(span)) {
          inflightRouteSpan = span;
          trackRoute(span);
        }
      });

      client.on('spanEnd', span => {
        if (span !== inflightRouteSpan) {
          return;
        }
        inflightRouteSpan = undefined;
        // Re-read the route on end: routing instrumentation frequently renames the pageload or navigation
        // span once the route is resolved, so this is more accurate than what we saw at span start.
        trackRoute(span);
      });

      registerInteractionListener(client, latestRoute, () => inflightRouteSpan, options);

      trackInteractionsAsSpans(client);
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures user interactions as spans.
 *
 * Important: This integration is considered experimental and might lead to noisy spans. Use at your own risk.
 *
 *
 * Clicks that happen outside of an in-progress pageload or navigation start an idle `ui.action.click` span,
 * named after the last known route, which collects everything the interaction triggers (requests, child spans,
 * …). Additionally, `ui.interaction.click` spans are recorded for the browser's own `event` timing entries.
 *
 * The integration requires `browserTracingIntegration` (or another source of pageload/navigation spans)
 * to know which route an interaction belongs to.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [Sentry.browserTracingIntegration(), Sentry.interactionsIntegration()],
 * });
 * ```
 */
export const interactionsIntegration = defineIntegration(_interactionsIntegration);

function isRouteSpan(span: Span): boolean {
  if (getRootSpan(span) !== span) {
    return false;
  }
  const op = spanToJSON(span).attributes[SENTRY_OP];
  return op === 'pageload' || op === 'navigation';
}

function registerInteractionListener(
  client: Client,
  latestRoute: RouteInfo,
  getInflightRouteSpan: () => Span | undefined,
  // `startIdleSpan` fills in `TRACING_DEFAULTS` for whatever is left out, which are the same defaults
  // `browserTracingIntegration` uses for its pageload and navigation spans.
  idleSpanOptions: InteractionsOptions,
): void {
  // `document` is not available in all browser environments (e.g. web workers), and without it there is
  // nothing to click on.
  if (!WINDOW.document) {
    return;
  }

  let inflightInteractionSpan: Span | undefined;

  addEventListener(
    'click',
    () => {
      if (getInflightRouteSpan()) {
        DEBUG_BUILD &&
          debug.warn(
            `[Tracing] Did not create ${UI_ACTION_CLICK} span because a pageload or navigation span is in progress.`,
          );
        return;
      }

      if (inflightInteractionSpan) {
        inflightInteractionSpan.setAttribute(SENTRY_IDLE_SPAN_FINISH_REASON, 'interactionInterrupted');
        inflightInteractionSpan.end();
        inflightInteractionSpan = undefined;
      }

      if (!latestRoute.name) {
        DEBUG_BUILD &&
          debug.warn(`[Tracing] Did not create ${UI_ACTION_CLICK} span because the latest route name is missing.`);
        return;
      }

      const hasSpanStreaming = hasSpanStreamingEnabled(client);
      const description = latestRoute.name;
      const streamedName = latestRoute.urlTemplate || latestRoute.httpRoute || UI_ACTION_CLICK_SPAN_NAME_FALLBACK;
      const streamedNameSource = latestRoute.urlTemplate || latestRoute.httpRoute ? 'route' : 'custom';

      inflightInteractionSpan = startIdleSpan(
        {
          name: hasSpanStreaming ? streamedName : description,
          attributes: {
            [SENTRY_OP]: UI_ACTION_CLICK,
            [SENTRY_SEGMENT_NAME_SOURCE]: hasSpanStreaming ? streamedNameSource : latestRoute.source || 'url',
            [SENTRY_ORIGIN]: 'auto.browser.interactions',
            ...(hasSpanStreaming && { [SENTRY_SEGMENT_NAME]: streamedName }),
            ...(latestRoute.urlTemplate && { [URL_TEMPLATE]: latestRoute.urlTemplate }),
            ...(latestRoute.httpRoute && { [HTTP_ROUTE]: latestRoute.httpRoute }),
            ...(latestRoute.urlPath && { [URL_PATH]: latestRoute.urlPath }),
            ...(latestRoute.urlFull && { [URL_FULL]: filterCollectedUrl(latestRoute.urlFull) }),
            ...(hasSpanStreaming && { [SENTRY_DESCRIPTION]: description }),
          },
        },
        idleSpanOptions,
      );
    },
    { capture: true },
  );
}

/**
 * Record the browser's `event` timing entries for clicks as spans on the currently active span.
 */
function trackInteractionsAsSpans(client: Client): void {
  addPerformanceInstrumentationHandler('event', ({ entries }) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'click') {
        const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
        const duration = msToSec(entry.duration);

        const selector = htmlTreeAsString(entry.target);
        const componentName = getComponentName(entry.target);
        const hasSpanStreaming = hasSpanStreamingEnabled(client);

        const spanOptions: StartSpanOptions & Required<Pick<StartSpanOptions, 'attributes'>> = {
          name: hasSpanStreaming ? componentName || UI_INTERACTION_CLICK_SPAN_NAME_FALLBACK : selector,
          startTime: startTime,
          attributes: {
            [SENTRY_OP]: UI_INTERACTION_CLICK,
            [SENTRY_ORIGIN]: 'auto.browser.interactions',
            'ui.element.selector': selector,
          },
        };

        if (componentName) {
          spanOptions.attributes[UI_COMPONENT_NAME] = componentName;
        }

        startAndEndSpan(parent, startTime, startTime + duration, spanOptions);
      }
    }
  });
}
