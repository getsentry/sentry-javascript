import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_IDLE_SPAN_FINISH_REASON,
  UI_COMPONENT_NAME,
  SENTRY_SOURCE,
  SENTRY_SEGMENT_NAME_SOURCE,
} from '@sentry/conventions/attributes';
import { UI_INTERACTION_CLICK, UI_ACTION_CLICK } from '@sentry/conventions/op';
import type { IntegrationFn, Span, StartSpanOptions, TransactionSource } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  defineIntegration,
  getActiveSpan,
  getComponentName,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import { startIdleSpan } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { htmlTreeAsString } from '../htmlTreeAsString';
import { addPerformanceInstrumentationHandler } from '../instrumentation/performanceObserver';
import { isBotUserAgent } from '../isBotUserAgent';
import { WINDOW } from '../types';
import { msToSec, startAndEndSpan } from './utils';

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
}

const _interactionsIntegration = ((options: InteractionsOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (isBotUserAgent()) {
        return;
      }

      const latestRoute: RouteInfo = { name: undefined, source: undefined };
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

      registerInteractionListener(latestRoute, () => inflightRouteSpan, options);

      trackInteractionsAsSpans();
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

      inflightInteractionSpan = startIdleSpan(
        {
          name: latestRoute.name,
          attributes: {
            [SENTRY_OP]: UI_ACTION_CLICK,
            [SENTRY_SEGMENT_NAME_SOURCE]: latestRoute.source || 'url',
            [SENTRY_ORIGIN]: 'auto.browser.interactions',
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
function trackInteractionsAsSpans(): void {
  addPerformanceInstrumentationHandler('event', ({ entries }) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'click') {
        const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
        const duration = msToSec(entry.duration);

        const spanOptions: StartSpanOptions & Required<Pick<StartSpanOptions, 'attributes'>> = {
          name: htmlTreeAsString(entry.target),
          startTime: startTime,
          attributes: {
            [SENTRY_OP]: UI_INTERACTION_CLICK,
            [SENTRY_ORIGIN]: 'auto.browser.interactions',
          },
        };

        const componentName = getComponentName(entry.target);
        if (componentName) {
          spanOptions.attributes[UI_COMPONENT_NAME] = componentName;
        }

        startAndEndSpan(parent, startTime, startTime + duration, spanOptions);
      }
    }
  });
}
