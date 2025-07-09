/* eslint-disable max-lines */
import type { Client, IntegrationFn, Span, StartSpanOptions, TransactionSource, WebFetchHeaders } from '@sentry/core';
import {
  addNonEnumerableProperty,
  browserPerformanceTimeOrigin,
  generateTraceId,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  getLocationHref,
  GLOBAL_OBJ,
  logger,
  parseStringToURLObject,
  propagationContextFromHeaders,
  registerSpanErrorInstrumentation,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanIsSampled,
  spanToJSON,
  startIdleSpan,
  TRACING_DEFAULTS,
} from '@sentry/core';
import {
  addHistoryInstrumentationHandler,
  addPerformanceEntries,
  registerInpInteractionListener,
  startTrackingElementTiming,
  startTrackingINP,
  startTrackingInteractions,
  startTrackingLongAnimationFrames,
  startTrackingLongTasks,
  startTrackingWebVitals,
} from '@sentry-internal/browser-utils';
import { DEBUG_BUILD } from '../debug-build';
import { getHttpRequestData, WINDOW } from '../helpers';
import { registerBackgroundTabDetection } from './backgroundtab';
import { linkTraces } from './linkedTraces';
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
   * If true, Sentry will capture [element timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming)
   * information and add it to the corresponding transaction.
   *
   * Default: true
   */
  enableElementTiming: boolean;

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
   * Resource spans with `op`s matching strings in the array will not be emitted.
   *
   * Default: []
   */
  ignoreResourceSpans: Array<'resouce.script' | 'resource.css' | 'resource.img' | 'resource.other' | string>;

  /**
   * Spans created from the following browser Performance APIs,
   *
   * - [`performance.mark(...)`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark)
   * - [`performance.measure(...)`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure)
   *
   * will not be emitted if their names match strings in this array.
   *
   * This is useful, if you come across `mark` or `measure` spans in your Sentry traces
   * that you want to ignore. For example, sometimes, browser extensions or libraries
   * emit these entries on their own, which might not be relevant to your application.
   *
   * * @example
   * ```ts
   * Sentry.init({
   *   integrations: [
   *     Sentry.browserTracingIntegration({
   *      ignorePerformanceApiSpans: ['myMeasurement', /myMark/],
   *     }),
   *   ],
   * });
   *
   * // no spans will be created for these:
   * performance.mark('myMark');
   * performance.measure('myMeasurement');
   *
   * // spans will be created for these:
   * performance.mark('authenticated');
   * performance.measure('input-duration', ...);
   * ```
   *
   * Default: [] - By default, all `mark` and `measure` entries are sent as spans.
   */
  ignorePerformanceApiSpans: Array<string | RegExp>;

  /**
   * Link the currently started trace to a previous trace (e.g. a prior pageload, navigation or
   * manually started span). When enabled, this option will allow you to navigate between traces
   * in the Sentry UI.
   *
   * You can set this option to the following values:
   *
   * - `'in-memory'`: The previous trace data will be stored in memory.
   *   This is useful for single-page applications and enabled by default.
   *
   * - `'session-storage'`: The previous trace data will be stored in the `sessionStorage`.
   *   This is useful for multi-page applications or static sites but it means that the
   *   Sentry SDK writes to the browser's `sessionStorage`.
   *
   * - `'off'`: The previous trace data will not be stored or linked.
   *
   * You can also use {@link BrowserTracingOptions.consistentTraceSampling} to get
   * consistent trace sampling of subsequent traces. Otherwise, by default, your
   * `tracesSampleRate` or `tracesSampler` config significantly influences how often
   * traces will be linked.
   *
   * @default 'in-memory' - see explanation above
   */
  linkPreviousTrace: 'in-memory' | 'session-storage' | 'off';

  /**
   * If true, Sentry will consistently sample subsequent traces based on the
   * sampling decision of the initial trace. For example, if the initial page
   * load trace was sampled positively, all subsequent traces (e.g. navigations)
   * are also sampled positively. In case the initial trace was sampled negatively,
   * all subsequent traces are also sampled negatively.
   *
   * This option allows you to get consistent, linked traces within a user journey
   * while maintaining an overall quota based on your trace sampling settings.
   *
   * This option is only effective if {@link BrowserTracingOptions.linkPreviousTrace}
   * is enabled (i.e. not set to `'off'`).
   *
   * @default `false` - this is an opt-in feature.
   */
  consistentTraceSampling: boolean;

  /**
   * _experiments allows the user to send options to define how this integration works.
   *
   * Default: undefined
   */
  _experiments: Partial<{
    enableInteractions: boolean;
    enableStandaloneClsSpans: boolean;
    enableStandaloneLcpSpans: boolean;
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

  /**
   * This callback is invoked directly after a span is started for an outgoing fetch or XHR request.
   * You can use it to annotate the span with additional data or attributes, for example by setting
   * attributes based on the passed request headers.
   */
  onRequestSpanStart?(span: Span, requestInformation: { headers?: WebFetchHeaders }): void;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  instrumentNavigation: true,
  instrumentPageLoad: true,
  markBackgroundSpan: true,
  enableLongTask: true,
  enableLongAnimationFrame: true,
  enableInp: true,
  enableElementTiming: true,
  ignoreResourceSpans: [],
  ignorePerformanceApiSpans: [],
  linkPreviousTrace: 'in-memory',
  consistentTraceSampling: false,
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
  const latestRoute: RouteInfo = {
    name: undefined,
    source: undefined,
  };

  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document as (typeof WINDOW)['document'] | undefined;

  const {
    enableInp,
    enableElementTiming,
    enableLongTask,
    enableLongAnimationFrame,
    _experiments: { enableInteractions, enableStandaloneClsSpans, enableStandaloneLcpSpans },
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
    ignoreResourceSpans,
    ignorePerformanceApiSpans,
    instrumentPageLoad,
    instrumentNavigation,
    linkPreviousTrace,
    consistentTraceSampling,
    onRequestSpanStart,
  } = {
    ...DEFAULT_BROWSER_TRACING_OPTIONS,
    ..._options,
  };

  let _collectWebVitals: undefined | (() => void);

  /** Create routing idle transaction. */
  function _createRouteSpan(client: Client, startSpanOptions: StartSpanOptions): void {
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
        // This will generally always be defined here, because it is set in `setup()` of the integration
        // but technically, it is optional, so we guard here to be extra safe
        _collectWebVitals?.();
        addPerformanceEntries(span, {
          recordClsOnPageloadSpan: !enableStandaloneClsSpans,
          recordLcpOnPageloadSpan: !enableStandaloneLcpSpans,
          ignoreResourceSpans,
          ignorePerformanceApiSpans,
        });
        setActiveIdleSpan(client, undefined);

        // A trace should stay consistent over the entire timespan of one route - even after the pageload/navigation ended.
        // Only when another navigation happens, we want to create a new trace.
        // This way, e.g. errors that occur after the pageload span ended are still associated to the pageload trace.
        const scope = getCurrentScope();
        const oldPropagationContext = scope.getPropagationContext();

        scope.setPropagationContext({
          ...oldPropagationContext,
          traceId: idleSpan.spanContext().traceId,
          sampled: spanIsSampled(idleSpan),
          dsc: getDynamicSamplingContextFromSpan(span),
        });
      },
    });

    setActiveIdleSpan(client, idleSpan);

    function emitFinish(): void {
      if (optionalWindowDocument && ['interactive', 'complete'].includes(optionalWindowDocument.readyState)) {
        client.emit('idleSpanEnableAutoFinish', idleSpan);
      }
    }

    if (isPageloadTransaction && optionalWindowDocument) {
      optionalWindowDocument.addEventListener('readystatechange', () => {
        emitFinish();
      });

      emitFinish();
    }
  }

  return {
    name: BROWSER_TRACING_INTEGRATION_ID,
    setup(client) {
      registerSpanErrorInstrumentation();

      _collectWebVitals = startTrackingWebVitals({
        recordClsStandaloneSpans: enableStandaloneClsSpans || false,
        recordLcpStandaloneSpans: enableStandaloneLcpSpans || false,
      });

      if (enableInp) {
        startTrackingINP();
      }

      if (enableElementTiming) {
        startTrackingElementTiming();
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

      function maybeEndActiveSpan(): void {
        const activeSpan = getActiveIdleSpan(client);

        if (activeSpan && !spanToJSON(activeSpan).timestamp) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current active span with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open active span, we need to finish it before creating an new one.
          activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'cancelled');
          activeSpan.end();
        }
      }

      client.on('startNavigationSpan', startSpanOptions => {
        if (getClient() !== client) {
          return;
        }

        maybeEndActiveSpan();

        getIsolationScope().setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });

        const scope = getCurrentScope();
        scope.setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });
        // We reset this to ensure we do not have lingering incorrect data here
        // places that call this hook may set this where appropriate - else, the URL at span sending time is used
        scope.setSDKProcessingMetadata({
          normalizedRequest: undefined,
        });

        _createRouteSpan(client, {
          op: 'navigation',
          ...startSpanOptions,
        });
      });

      client.on('startPageLoadSpan', (startSpanOptions, traceOptions = {}) => {
        if (getClient() !== client) {
          return;
        }
        maybeEndActiveSpan();

        const sentryTrace = traceOptions.sentryTrace || getMetaContent('sentry-trace');
        const baggage = traceOptions.baggage || getMetaContent('baggage');

        const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

        const scope = getCurrentScope();
        scope.setPropagationContext(propagationContext);

        // We store the normalized request data on the scope, so we get the request data at time of span creation
        // otherwise, the URL etc. may already be of the following navigation, and we'd report the wrong URL
        scope.setSDKProcessingMetadata({
          normalizedRequest: getHttpRequestData(),
        });

        _createRouteSpan(client, {
          op: 'pageload',
          ...startSpanOptions,
        });
      });
    },
    afterAllSetup(client) {
      let startingUrl: string | undefined = getLocationHref();

      if (linkPreviousTrace !== 'off') {
        linkTraces(client, { linkPreviousTrace, consistentTraceSampling });
      }

      if (WINDOW.location) {
        if (instrumentPageLoad) {
          const origin = browserPerformanceTimeOrigin();
          startBrowserTracingPageLoadSpan(client, {
            name: WINDOW.location.pathname,
            // pageload should always start at timeOrigin (and needs to be in s, not ms)
            startTime: origin ? origin / 1000 : undefined,
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
            if (from === undefined && startingUrl?.indexOf(to) !== -1) {
              startingUrl = undefined;
              return;
            }

            startingUrl = undefined;
            const parsed = parseStringToURLObject(to);
            startBrowserTracingNavigationSpan(client, {
              name: parsed?.pathname || WINDOW.location.pathname,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
              },
            });

            // We store the normalized request data on the scope, so we get the request data at time of span creation
            // otherwise, the URL etc. may already be of the following navigation, and we'd report the wrong URL
            getCurrentScope().setSDKProcessingMetadata({
              normalizedRequest: {
                ...getHttpRequestData(),
                // Ensure to set this, so this matches the target route even if the URL has not yet been updated
                url: to,
              },
            });
          });
        }
      }

      if (markBackgroundSpan) {
        registerBackgroundTabDetection();
      }

      if (enableInteractions) {
        registerInteractionListener(client, idleTimeout, finalTimeout, childSpanTimeout, latestRoute);
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
        onRequestSpanStart,
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

  return getActiveIdleSpan(client);
}

/**
 * Manually start a navigation span.
 * This will only do something if a browser tracing integration has been setup.
 */
export function startBrowserTracingNavigationSpan(client: Client, spanOptions: StartSpanOptions): Span | undefined {
  client.emit('beforeStartNavigationSpan', spanOptions);
  client.emit('startNavigationSpan', spanOptions);

  getCurrentScope().setTransactionName(spanOptions.name);

  return getActiveIdleSpan(client);
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | undefined {
  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document as (typeof WINDOW)['document'] | undefined;

  const metaTag = optionalWindowDocument?.querySelector(`meta[name=${metaName}]`);
  return metaTag?.getAttribute('content') || undefined;
}

/** Start listener for interaction transactions */
function registerInteractionListener(
  client: Client,
  idleTimeout: BrowserTracingOptions['idleTimeout'],
  finalTimeout: BrowserTracingOptions['finalTimeout'],
  childSpanTimeout: BrowserTracingOptions['childSpanTimeout'],
  latestRoute: RouteInfo,
): void {
  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document as (typeof WINDOW)['document'] | undefined;

  let inflightInteractionSpan: Span | undefined;
  const registerInteractionTransaction = (): void => {
    const op = 'ui.action.click';

    const activeIdleSpan = getActiveIdleSpan(client);
    if (activeIdleSpan) {
      const currentRootSpanOp = spanToJSON(activeIdleSpan).op;
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

  if (optionalWindowDocument) {
    addEventListener('click', registerInteractionTransaction, { once: false, capture: true });
  }
}

// We store the active idle span on the client object, so we can access it from exported functions
const ACTIVE_IDLE_SPAN_PROPERTY = '_sentry_idleSpan';
function getActiveIdleSpan(client: Client): Span | undefined {
  return (client as { [ACTIVE_IDLE_SPAN_PROPERTY]?: Span })[ACTIVE_IDLE_SPAN_PROPERTY];
}

function setActiveIdleSpan(client: Client, span: Span | undefined): void {
  addNonEnumerableProperty(client, ACTIVE_IDLE_SPAN_PROPERTY, span);
}
