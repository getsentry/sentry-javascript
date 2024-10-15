/* eslint-disable max-lines */
import {
  addHistoryInstrumentationHandler,
  addPerformanceEntries,
  registerInpInteractionListener,
  startTrackingINP,
  startTrackingInteractions,
  startTrackingLongAnimationFrames,
  startTrackingLongTasks,
  startTrackingWebVitals,
} from '@sentry-internal/browser-utils';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  getRootSpan,
  registerSpanErrorInstrumentation,
  spanIsSampled,
  spanToJSON,
  startIdleSpan,
} from '@sentry/core';
import type { Client, IntegrationFn, StartSpanOptions, TransactionSource } from '@sentry/types';
import type { Span } from '@sentry/types';
import {
  GLOBAL_OBJ,
  browserPerformanceTimeOrigin,
  generatePropagationContext,
  getDomElement,
  logger,
  propagationContextFromHeaders,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import { registerBackgroundTabDetection } from './backgroundtab';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request';

export const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

interface RouteInfo {
  name: string | undefined;
  source: TransactionSource | undefined;
}

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions {
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   *
   * Default: 1000 (ms)
   */
  idleTimeout: number;

  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * Default: 30000 (ms)
   */
  finalTimeout: number;

  /**
   The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * Default: 15000 (ms)
   */
  childSpanTimeout: number;

  /**
   * If a span should be created on page load.
   * If this is set to `false`, this integration will not start the default page load span.
   * Default: true
   */
  instrumentPageLoad: boolean;

  /**
   * If a span should be created on navigation (history change).
   * If this is set to `false`, this integration will not start the default navigation spans.
   * Default: true
   */
  instrumentNavigation: boolean;

  /**
   * Flag spans where tabs moved to background with "cancelled". Browser background tab timing is
   * not suited towards doing precise measurements of operations. By default, we recommend that this option
   * be enabled as background transactions can mess up your statistics in nondeterministic ways.
   *
   * Default: true
   */
  markBackgroundSpan: boolean;

  /**
   * If true, Sentry will capture long tasks and add them to the corresponding transaction.
   *
   * Default: true
   */
  enableLongTask: boolean;

  /**
   * If true, Sentry will capture long animation frames and add them to the corresponding transaction.
   *
   * Default: false
   */
  enableLongAnimationFrame: boolean;

  /**
   * If true, Sentry will capture first input delay and add it to the corresponding transaction.
   *
   * Default: true
   */
  enableInp: boolean;

  /**
   * Flag to disable patching all together for fetch requests.
   *
   * Default: true
   */
  traceFetch: boolean;

  /**
   * Flag to disable patching all together for xhr requests.
   *
   * Default: true
   */
  traceXHR: boolean;

  /**
   * Flag to disable tracking of long-lived streams, like server-sent events (SSE) via fetch.
   * Do not enable this in case you have live streams or very long running streams.
   *
   * Default: false
   */
  trackFetchStreamPerformance: boolean;

  /**
   * If true, Sentry will capture http timings and add them to the corresponding http spans.
   *
   * Default: true
   */
  enableHTTPTimings: boolean;

  /**
   * _experiments allows the user to send options to define how this integration works.
   *
   * Default: undefined
   */
  _experiments: Partial<{
    enableInteractions: boolean;
    enableStandaloneClsSpans: boolean;
  }>;

  /**
   * A callback which is called before a span for a pageload or navigation is started.
   * It receives the options passed to `startSpan`, and expects to return an updated options object.
   */
  beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;

  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * Default: (url: string) => true
   */
  shouldCreateSpanForRequest?(this: void, url: string): boolean;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  instrumentNavigation: true,
  instrumentPageLoad: true,
  markBackgroundSpan: true,
  enableLongTask: true,
  enableLongAnimationFrame: true,
  enableInp: true,
  _experiments: {},
  ...defaultRequestInstrumentationOptions,
};

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library.
 *
 * We explicitly export the proper type here, as this has to be extended in some cases.
 */
export const browserTracingIntegration = ((_options: Partial<BrowserTracingOptions> = {}) => {
  registerSpanErrorInstrumentation();

  const {
    enableInp,
    enableLongTask,
    enableLongAnimationFrame,
    _experiments: { enableInteractions, enableStandaloneClsSpans },
    beforeStartSpan,
    idleTimeout,
    finalTimeout,
    childSpanTimeout,
    markBackgroundSpan,
    traceFetch,
    traceXHR,
    trackFetchStreamPerformance,
    shouldCreateSpanForRequest,
    enableHTTPTimings,
    instrumentPageLoad,
    instrumentNavigation,
  } = {
    ...DEFAULT_BROWSER_TRACING_OPTIONS,
    ..._options,
  };

  const _collectWebVitals = startTrackingWebVitals({ recordClsStandaloneSpans: enableStandaloneClsSpans || false });

  if (enableInp) {
    startTrackingINP();
  }

  if (
    enableLongAnimationFrame &&
    GLOBAL_OBJ.PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes &&
    PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
  ) {
    startTrackingLongAnimationFrames();
  } else if (enableLongTask) {
    startTrackingLongTasks();
  }

  if (enableInteractions) {
    startTrackingInteractions();
  }

  const latestRoute: RouteInfo = {
    name: undefined,
    source: undefined,
  };

  /** Create routing idle transaction. */
  function _createRouteSpan(client: Client, startSpanOptions: StartSpanOptions): Span {
    const isPageloadTransaction = startSpanOptions.op === 'pageload';

    const finalStartSpanOptions: StartSpanOptions = beforeStartSpan
      ? beforeStartSpan(startSpanOptions)
      : startSpanOptions;

    const attributes = finalStartSpanOptions.attributes || {};

    // If `finalStartSpanOptions.name` is different than `startSpanOptions.name`
    // it is because `beforeStartSpan` set a custom name. Therefore we set the source to 'custom'.
    if (startSpanOptions.name !== finalStartSpanOptions.name) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'custom';
      finalStartSpanOptions.attributes = attributes;
    }

    latestRoute.name = finalStartSpanOptions.name;
    latestRoute.source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    const idleSpan = startIdleSpan(finalStartSpanOptions, {
      idleTimeout,
      finalTimeout,
      childSpanTimeout,
      // should wait for finish signal if it's a pageload transaction
      disableAutoFinish: isPageloadTransaction,
      beforeSpanEnd: span => {
        _collectWebVitals();
        addPerformanceEntries(span, { recordClsOnPageloadSpan: !enableStandaloneClsSpans });
      },
    });

    function emitFinish(): void {
      if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
        client.emit('idleSpanEnableAutoFinish', idleSpan);
      }
    }

    if (isPageloadTransaction && WINDOW.document) {
      WINDOW.document.addEventListener('readystatechange', () => {
        emitFinish();
      });

      emitFinish();
    }

    return idleSpan;
  }

  return {
    name: BROWSER_TRACING_INTEGRATION_ID,
    afterAllSetup(client) {
      let activeSpan: Span | undefined;
      let startingUrl: string | undefined = WINDOW.location && WINDOW.location.href;

      client.on('startNavigationSpan', startSpanOptions => {
        if (getClient() !== client) {
          return;
        }

        if (activeSpan && !spanToJSON(activeSpan).timestamp) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current root span with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeSpan.end();
        }

        activeSpan = _createRouteSpan(client, {
          op: 'navigation',
          ...startSpanOptions,
        });
      });

      client.on('startPageLoadSpan', (startSpanOptions, traceOptions = {}) => {
        if (getClient() !== client) {
          return;
        }

        if (activeSpan && !spanToJSON(activeSpan).timestamp) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current root span with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeSpan.end();
        }

        const sentryTrace = traceOptions.sentryTrace || getMetaContent('sentry-trace');
        const baggage = traceOptions.baggage || getMetaContent('baggage');

        const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
        getCurrentScope().setPropagationContext(propagationContext);

        activeSpan = _createRouteSpan(client, {
          op: 'pageload',
          ...startSpanOptions,
        });
      });

      // A trace should to stay the consistent over the entire time span of one route.
      // Therefore, when the initial pageload or navigation root span ends, we update the
      // scope's propagation context to keep span-specific attributes like the `sampled` decision and
      // the dynamic sampling context valid, even after the root span has ended.
      // This ensures that the trace data is consistent for the entire duration of the route.
      client.on('spanEnd', span => {
        const op = spanToJSON(span).op;
        if (span !== getRootSpan(span) || (op !== 'navigation' && op !== 'pageload')) {
          return;
        }

        const scope = getCurrentScope();
        const oldPropagationContext = scope.getPropagationContext();

        scope.setPropagationContext({
          ...oldPropagationContext,
          sampled: oldPropagationContext.sampled !== undefined ? oldPropagationContext.sampled : spanIsSampled(span),
          dsc: oldPropagationContext.dsc || getDynamicSamplingContextFromSpan(span),
        });
      });

      if (WINDOW.location) {
        if (instrumentPageLoad) {
          startBrowserTracingPageLoadSpan(client, {
            name: WINDOW.location.pathname,
            // pageload should always start at timeOrigin (and needs to be in s, not ms)
            startTime: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
            },
          });
        }

        if (instrumentNavigation) {
          addHistoryInstrumentationHandler(({ to, from }) => {
            /**
             * This early return is there to account for some cases where a navigation transaction starts right after
             * long-running pageload. We make sure that if `from` is undefined and a valid `startingURL` exists, we don't
             * create an uneccessary navigation transaction.
             *
             * This was hard to duplicate, but this behavior stopped as soon as this fix was applied. This issue might also
             * only be caused in certain development environments where the usage of a hot module reloader is causing
             * errors.
             */
            if (from === undefined && startingUrl && startingUrl.indexOf(to) !== -1) {
              startingUrl = undefined;
              return;
            }

            if (from !== to) {
              startingUrl = undefined;
              startBrowserTracingNavigationSpan(client, {
                name: WINDOW.location.pathname,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
                },
              });
            }
          });
        }
      }

      if (markBackgroundSpan) {
        registerBackgroundTabDetection();
      }

      if (enableInteractions) {
        registerInteractionListener(idleTimeout, finalTimeout, childSpanTimeout, latestRoute);
      }

      if (enableInp) {
        registerInpInteractionListener();
      }

      instrumentOutgoingRequests(client, {
        traceFetch,
        traceXHR,
        trackFetchStreamPerformance,
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
        shouldCreateSpanForRequest,
        enableHTTPTimings,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Manually start a page load span.
 * This will only do something if a browser tracing integration integration has been setup.
 *
 * If you provide a custom `traceOptions` object, it will be used to continue the trace
 * instead of the default behavior, which is to look it up on the <meta> tags.
 */
export function startBrowserTracingPageLoadSpan(
  client: Client,
  spanOptions: StartSpanOptions,
  traceOptions?: { sentryTrace?: string | undefined; baggage?: string | undefined },
): Span | undefined {
  client.emit('startPageLoadSpan', spanOptions, traceOptions);

  getCurrentScope().setTransactionName(spanOptions.name);

  const span = getActiveSpan();
  const op = span && spanToJSON(span).op;
  return op === 'pageload' ? span : undefined;
}

/**
 * Manually start a navigation span.
 * This will only do something if a browser tracing integration has been setup.
 */
export function startBrowserTracingNavigationSpan(client: Client, spanOptions: StartSpanOptions): Span | undefined {
  getIsolationScope().setPropagationContext(generatePropagationContext());
  getCurrentScope().setPropagationContext(generatePropagationContext());

  client.emit('startNavigationSpan', spanOptions);

  getCurrentScope().setTransactionName(spanOptions.name);

  const span = getActiveSpan();
  const op = span && spanToJSON(span).op;
  return op === 'navigation' ? span : undefined;
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | undefined {
  // Can't specify generic to `getDomElement` because tracing can be used
  // in a variety of environments, have to disable `no-unsafe-member-access`
  // as a result.
  const metaTag = getDomElement(`meta[name=${metaName}]`);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return metaTag ? metaTag.getAttribute('content') : undefined;
}

/** Start listener for interaction transactions */
function registerInteractionListener(
  idleTimeout: BrowserTracingOptions['idleTimeout'],
  finalTimeout: BrowserTracingOptions['finalTimeout'],
  childSpanTimeout: BrowserTracingOptions['childSpanTimeout'],
  latestRoute: RouteInfo,
): void {
  let inflightInteractionSpan: Span | undefined;
  const registerInteractionTransaction = (): void => {
    const op = 'ui.action.click';

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);
    if (rootSpan) {
      const currentRootSpanOp = spanToJSON(rootSpan).op;
      if (['navigation', 'pageload'].includes(currentRootSpanOp as string)) {
        DEBUG_BUILD &&
          logger.warn(`[Tracing] Did not create ${op} span because a pageload or navigation span is in progress.`);
        return undefined;
      }
    }

    if (inflightInteractionSpan) {
      inflightInteractionSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'interactionInterrupted');
      inflightInteractionSpan.end();
      inflightInteractionSpan = undefined;
    }

    if (!latestRoute.name) {
      DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _latestRouteName is missing.`);
      return undefined;
    }

    inflightInteractionSpan = startIdleSpan(
      {
        name: latestRoute.name,
        op,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: latestRoute.source || 'url',
        },
      },
      {
        idleTimeout,
        finalTimeout,
        childSpanTimeout,
      },
    );
  };

  if (WINDOW.document) {
    addEventListener('click', registerInteractionTransaction, { once: false, capture: true });
  }
}
