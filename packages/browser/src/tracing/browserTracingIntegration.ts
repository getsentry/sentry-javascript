/* eslint-disable max-lines */
import type {
  Client,
  IntegrationFn,
  RequestHookInfo,
  ResponseHookInfo,
  Span,
  StartSpanOptions,
} from '@sentry/core/browser';
import {
  _INTERNAL_ensureBrowserSpanStreaming,
  addNonEnumerableProperty,
  consoleSandbox,
  dateTimestampInSeconds,
  debug,
  generateSpanId,
  generateTraceId,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  GLOBAL_OBJ,
  hasSpansEnabled,
  hasSpanStreamingEnabled,
  NAVIGATION_SPAN_NAME_FALLBACK,
  PAGELOAD_SPAN_NAME_FALLBACK,
  isURLObjectRelative,
  parseStringToURLObject,
  propagationContextFromHeaders,
  registerSpanErrorInstrumentation,
  resolveCurrentRoute,
  resolveRoute,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanIsSampled,
  spanToJSON,
  startIdleSpan,
  startInactiveSpan,
  timestampInSeconds,
  TRACING_DEFAULTS,
  browserPerformanceTimeOrigin,
} from '@sentry/core/browser';
import {
  addHistoryInstrumentationHandler,
  addPerformanceEntries,
  getLocationHref,
  isBotUserAgent,
  startTrackingLongAnimationFrames,
  startTrackingLongTasks,
} from '@sentry/browser-utils';
import { DEBUG_BUILD } from '../debug-build';
import { filterCollectedUrl } from '@sentry/core';
import { getHttpRequestData, WINDOW } from '../helpers';
import { WEB_VITALS_INTEGRATION_NAME, webVitalsIntegration } from '../integrations/webVitals';
import { registerBackgroundTabDetection } from './backgroundtab';
import { linkTraces } from './linkedTraces';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_OP,
  URL_FULL,
  URL_PATH,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { NAVIGATION, NAVIGATION_REDIRECT, PAGELOAD } from '@sentry/conventions/op';

export const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

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
   * @deprecated This option is no longer used. Element timing is now tracked via the standalone
   * `elementTimingIntegration`. Add it to your `integrations` array to collect element timing metrics.
   */
  enableElementTiming?: boolean;

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
  ignoreResourceSpans: Array<'resource.script' | 'resource.css' | 'resource.img' | 'resource.other' | string>;

  /**
   * By default, the SDK will try to detect redirects and avoid creating separate spans for them.
   * If you want to opt-out of this behavior, you can set this option to `false`.
   *
   * Default: true
   */
  detectRedirects: boolean;

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
   * If set to `true`, the pageload span will not end itself automatically, unless it
   * runs until the {@link BrowserTracingOptions.finalTimeout} (30 seconds by default) is reached.
   *
   * Set this option to `true`, if you want full control over the pageload span duration.
   * You can use `Sentry.reportPageLoaded()` to manually end the pageload span whenever convenient.
   * Be aware that you have to ensure that this is always called, regardless of the chosen route
   * or path in the application.
   *
   * @default `false`. By default, the pageload span will end itself automatically, based on
   * the {@link BrowserTracingOptions.finalTimeout}, {@link BrowserTracingOptions.idleTimeout}
   * and {@link BrowserTracingOptions.childSpanTimeout}. This is more convenient to use but means
   * that the pageload duration can be arbitrary and might not be fully representative of a perceived
   * page load time.
   */
  enableReportPageLoaded: boolean;

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
  onRequestSpanStart?(span: Span, requestInformation: RequestHookInfo): void;

  /**
   * Is called when spans end for outgoing requests, providing access to response headers.
   */
  onRequestSpanEnd?(span: Span, responseInformation: ResponseHookInfo): void;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  instrumentNavigation: true,
  instrumentPageLoad: true,
  markBackgroundSpan: true,
  enableLongTask: true,
  enableLongAnimationFrame: true,
  enableInp: true,
  ignoreResourceSpans: [],
  detectRedirects: true,
  linkPreviousTrace: 'in-memory',
  consistentTraceSampling: false,
  enableReportPageLoaded: false,
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
export const browserTracingIntegration = ((options: Partial<BrowserTracingOptions> = {}) => {
  if ('enableElementTiming' in options) {
    consoleSandbox(() => {
      // oxlint-disable-next-line no-console
      console.warn(
        '[Sentry] `enableElementTiming` is deprecated and no longer has any effect. Use the standalone `elementTimingIntegration` instead.',
      );
    });
  }

  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document as (typeof WINDOW)['document'] | undefined;

  const {
    enableInp,
    enableLongTask,
    enableLongAnimationFrame,
    beforeStartSpan,
    idleTimeout,
    finalTimeout,
    childSpanTimeout,
    markBackgroundSpan,
    traceFetch,
    traceXHR,
    shouldCreateSpanForRequest,
    enableHTTPTimings,
    ignoreResourceSpans,
    instrumentPageLoad,
    instrumentNavigation,
    detectRedirects,
    linkPreviousTrace,
    consistentTraceSampling,
    enableReportPageLoaded,
    onRequestSpanStart,
    onRequestSpanEnd,
  } = {
    ...DEFAULT_BROWSER_TRACING_OPTIONS,
    ...options,
  };

  const _isBot = isBotUserAgent();

  let lastInteractionTimestamp: number | undefined;

  let _pageloadSpan: Span | undefined;

  /** Create routing idle transaction. */
  function _createRouteSpan(client: Client, startSpanOptions: StartSpanOptions, makeActive = true, url?: string): void {
    const isPageloadSpan = startSpanOptions.op === 'pageload';

    const initialSpanName = startSpanOptions.name;
    const finalStartSpanOptions: StartSpanOptions = beforeStartSpan
      ? beforeStartSpan(startSpanOptions)
      : startSpanOptions;

    // For navigations, `url` is the destination URL, so we use it to reflect the post-navigation location.
    // For pageloads (and manual navigation spans without a URL) we fall back to the current location.
    const urlObject = parseStringToURLObject(url || getLocationHref());

    const attributes = {
      ...(urlObject?.pathname && { [URL_PATH]: urlObject.pathname }),
      ...(urlObject && !isURLObjectRelative(urlObject) && { [URL_FULL]: filterCollectedUrl(urlObject.href) }),
      ...finalStartSpanOptions.attributes,
    };

    // If `finalStartSpanOptions.name` is different than `startSpanOptions.name`
    // it is because `beforeStartSpan` set a custom name. Therefore we set the source to 'custom'.
    if (initialSpanName !== finalStartSpanOptions.name) {
      attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'custom';
    }

    finalStartSpanOptions.attributes = attributes;

    if (!makeActive) {
      // We want to ensure this has 0s duration
      const now = dateTimestampInSeconds();
      startInactiveSpan({
        ...finalStartSpanOptions,
        startTime: now,
      }).end(now);
      return;
    }

    const idleSpan = startIdleSpan(finalStartSpanOptions, {
      idleTimeout,
      finalTimeout,
      childSpanTimeout,
      // should wait for finish signal if it's a pageload transaction
      disableAutoFinish: isPageloadSpan,
      trimIdleSpanEndTimestamp: !enableReportPageLoaded,
    });

    if (isPageloadSpan && enableReportPageLoaded) {
      _pageloadSpan = idleSpan;
    }

    setActiveIdleSpan(client, idleSpan);

    function emitFinish(): void {
      if (optionalWindowDocument && ['interactive', 'complete'].includes(optionalWindowDocument.readyState)) {
        client.emit('idleSpanEnableAutoFinish', idleSpan);
        // Once the finish signal has been emitted, the listener is no longer needed. Removing it here (rather than
        // relying on `{ once: true }`) also covers the common case where the document is already loaded when the span
        // starts, so the listener never fires and would otherwise leak together with the `idleSpan` it closes over.
        optionalWindowDocument.removeEventListener('readystatechange', emitFinish);
      }
    }

    // Enable auto finish of the pageload span if users are not explicitly ending it
    if (isPageloadSpan && !enableReportPageLoaded && optionalWindowDocument) {
      optionalWindowDocument.addEventListener('readystatechange', emitFinish);

      emitFinish();
    }
  }

  return {
    name: BROWSER_TRACING_INTEGRATION_ID,
    setup(client) {
      if (_isBot) {
        DEBUG_BUILD && debug.log('[Tracing] Skipping browserTracingIntegration setup for bot user agent.');
        return;
      }

      registerSpanErrorInstrumentation();

      if (
        enableLongAnimationFrame &&
        GLOBAL_OBJ.PerformanceObserver &&
        PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
      ) {
        startTrackingLongAnimationFrames();
      } else if (enableLongTask) {
        startTrackingLongTasks();
      }

      if (detectRedirects && optionalWindowDocument) {
        const interactionHandler = (): void => {
          lastInteractionTimestamp = timestampInSeconds();
        };
        addEventListener('click', interactionHandler, { capture: true });
        addEventListener('keydown', interactionHandler, { capture: true, passive: true });
      }

      function maybeEndActiveSpan(): void {
        const activeSpan = getActiveIdleSpan(client);

        if (activeSpan && !spanToJSON(activeSpan).end_timestamp) {
          DEBUG_BUILD &&
            debug.log(
              `[Tracing] Finishing current active span with op: ${spanToJSON(activeSpan).attributes[SENTRY_OP]}`,
            );
          // If there's an open active span, we need to finish it before creating an new one.
          activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'cancelled');
          activeSpan.end();
        }
      }

      client.on('beforeIdleSpanEnd', span => {
        // Interaction idle spans also flow through this hook, but the route bookkeeping below only
        // applies to the pageload/navigation span. We identify it by reference rather than by op:
        // only the route span is registered as the active idle span.
        if (getActiveIdleSpan(client) !== span) {
          return;
        }

        addPerformanceEntries(span, {
          ignoreResourceSpans,
          spanStreamingEnabled: hasSpanStreamingEnabled(client),
        });
        setActiveIdleSpan(client, undefined);

        // A trace should stay consistent over the entire timespan of one route - even after the pageload/navigation ended.
        // Only when another navigation happens, we want to create a new trace.
        // This way, e.g. errors that occur after the pageload span ended are still associated to the pageload trace.
        const scope = getCurrentScope();
        const oldPropagationContext = scope.getPropagationContext();

        scope.setPropagationContext({
          ...oldPropagationContext,
          traceId: span.spanContext().traceId,
          sampled: spanIsSampled(span),
          dsc: getDynamicSamplingContextFromSpan(span),
        });

        if (_pageloadSpan === span) {
          // clean up the stored pageload span on the integration.
          _pageloadSpan = undefined;
        }
      });

      client.on('startNavigationSpan', (startSpanOptions, navigationOptions) => {
        if (getClient() !== client) {
          return;
        }

        if (navigationOptions?.isRedirect) {
          DEBUG_BUILD &&
            debug.warn('[Tracing] Detected redirect, navigation span will not be the root span, but a child span.');
          _createRouteSpan(
            client,
            {
              op: NAVIGATION_REDIRECT,
              ...startSpanOptions,
            },
            false,
            navigationOptions.url,
          );
          return;
        }

        // Reset the last interaction timestamp since we now start a new navigation.
        // Any subsequent navigation span starts could again be a redirect, so we
        // should reset our heuristic detectors.
        lastInteractionTimestamp = undefined;

        maybeEndActiveSpan();

        const scope = getCurrentScope();
        scope.setPropagationContext({
          traceId: generateTraceId(),
          sampleRand: Math.random(),
          propagationSpanId: hasSpansEnabled() ? undefined : generateSpanId(),
        });

        // We reset this to ensure we do not have lingering incorrect data here
        // places that call this hook may set this where appropriate - else, the URL at span sending time is used
        scope.setSDKProcessingMetadata({
          normalizedRequest: undefined,
        });

        _createRouteSpan(
          client,
          {
            op: NAVIGATION,
            ...startSpanOptions,
            // Navigation starts a new trace and is NOT parented under any active interaction (e.g. ui.action.click)
            parentSpan: null,
          },
          true,
          navigationOptions?.url,
        );
      });

      client.on('startPageLoadSpan', (startSpanOptions, traceOptions = {}) => {
        if (getClient() !== client) {
          return;
        }
        maybeEndActiveSpan();

        const sentryTrace =
          traceOptions.sentryTrace || getMetaContent('sentry-trace') || getServerTiming('sentry-trace');
        const baggage = traceOptions.baggage || getMetaContent('baggage') || getServerTiming('baggage');

        const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

        const scope = getCurrentScope();
        scope.setPropagationContext(propagationContext);
        if (!hasSpansEnabled()) {
          // for browser, we wanna keep the spanIds consistent during the entire lifetime of the trace
          // this works by setting the propagationSpanId to a random spanId so that we have a consistent
          // span id to propagate in TwP mode (!hasSpansEnabled())
          scope.getPropagationContext().propagationSpanId = generateSpanId();
        }

        // We store the normalized request data on the scope, so we get the request data at time of span creation
        // otherwise, the URL etc. may already be of the following navigation, and we'd report the wrong URL
        scope.setSDKProcessingMetadata({
          normalizedRequest: getHttpRequestData(),
        });

        _createRouteSpan(client, {
          op: PAGELOAD,
          ...startSpanOptions,
        });
      });

      client.on('endPageloadSpan', () => {
        if (enableReportPageLoaded && _pageloadSpan) {
          _pageloadSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'reportPageLoaded');
          _pageloadSpan.end();
        }
      });
    },

    afterAllSetup(client) {
      if (_isBot) {
        return;
      }

      // Technically, every startSpan call already ensures that `spanStreamingIntegration` is installed,
      // but we do it here anyway for the edge case that users disabled pageload and navigation spans and
      // purely rely on manual startSpan calls.
      _INTERNAL_ensureBrowserSpanStreaming(client);

      // Auto-register webVitalsIntegration if the user hasn't added one. We do this in
      // afterAllSetup so that a user-provided webVitalsIntegration - which may be ordered after
      // browserTracingIntegration in the integrations array - has already been installed.
      if (client.addIntegration && !client.getIntegrationByName?.(WEB_VITALS_INTEGRATION_NAME)) {
        client.addIntegration(
          webVitalsIntegration({
            ignore: enableInp ? [] : ['inp'],
          }),
        );
      }

      let startingUrl: string | undefined = getLocationHref();

      if (linkPreviousTrace !== 'off') {
        linkTraces(client, { linkPreviousTrace, consistentTraceSampling });
      }

      if (WINDOW.location) {
        if (instrumentPageLoad) {
          const route = resolveCurrentRoute(client);
          startBrowserTracingPageLoadSpan(client, {
            // Without a route provider there is no route information here, and with span streaming
            // span names have to be low cardinality, so the name falls back to a constant.
            name: route ?? (hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : WINDOW.location.pathname),
            attributes: {
              [SENTRY_SEGMENT_NAME_SOURCE]: route ? 'route' : 'url',
              ...(route && { [URL_TEMPLATE]: route }),
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
            const activeSpan = getActiveIdleSpan(client);
            const navigationIsRedirect =
              activeSpan && detectRedirects && isRedirect(activeSpan, lastInteractionTimestamp);

            // Resolved from the destination rather than the current location, which has not
            // committed to `to` yet at this point.
            const route = resolveRoute(to, client);

            startBrowserTracingNavigationSpan(
              client,
              {
                // Without a route provider there is no route information here, and with span
                // streaming span names have to be low cardinality, so the name falls back to a
                // constant.
                name:
                  route ??
                  (hasSpanStreamingEnabled(client)
                    ? NAVIGATION_SPAN_NAME_FALLBACK
                    : parsed?.pathname || WINDOW.location.pathname),
                attributes: {
                  [SENTRY_SEGMENT_NAME_SOURCE]: route ? 'route' : 'url',
                  ...(route && { [URL_TEMPLATE]: route }),
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
                },
              },
              { url: to, isRedirect: navigationIsRedirect },
            );
          });
        }
      }

      if (markBackgroundSpan) {
        registerBackgroundTabDetection();
      }

      instrumentOutgoingRequests(client, {
        traceFetch,
        traceXHR,
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
        shouldCreateSpanForRequest,
        enableHTTPTimings,
        onRequestSpanStart,
        onRequestSpanEnd,
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
  // `Pageload` is a low-cardinality span name, not a description of the page. The scope's
  // transaction name is what error events are grouped by, so it keeps the URL instead.
  const isFallbackSpanName = spanOptions.name === PAGELOAD_SPAN_NAME_FALLBACK;
  getCurrentScope().setTransactionName(isFallbackSpanName ? WINDOW.location?.pathname : spanOptions.name);
  // A pageload span always covers the entire page load, no matter how late the SDK or a routing
  // instrumentation gets around to starting it. Everything that happened before (DNS, TLS, TTFB,
  // HTML parsing, chunk loading) is part of the page load and the performance child spans we attach
  // later are anchored at the time origin anyway.
  const timeOrigin = browserPerformanceTimeOrigin();
  const pageloadSpanOptions: StartSpanOptions = {
    ...spanOptions,
    // startTime needs to be in seconds, not ms
    startTime: spanOptions.startTime ?? (timeOrigin ? timeOrigin / 1000 : undefined),
  };

  client.emit('startPageLoadSpan', pageloadSpanOptions, traceOptions);

  const pageloadSpan = getActiveIdleSpan(client);

  if (pageloadSpan) {
    client.emit('afterStartPageLoadSpan', pageloadSpan);
  }

  return pageloadSpan;
}

/**
 * Manually start a navigation span.
 * This will only do something if a browser tracing integration has been setup.
 */
export function startBrowserTracingNavigationSpan(
  client: Client,
  spanOptions: StartSpanOptions,
  options?: { url?: string; isRedirect?: boolean },
): Span | undefined {
  const { url, isRedirect } = options || {};
  client.emit('beforeStartNavigationSpan', spanOptions, { isRedirect, url });
  client.emit('startNavigationSpan', spanOptions, { isRedirect, url });

  const scope = getCurrentScope();
  // `Navigation` is a low-cardinality span name, not a description of the page. The scope's
  // transaction name is what error events are grouped by, so it keeps the URL instead. `url` is the
  // destination, while `location` still points at the previous page during a `pushState`.
  const isFallbackSpanName = spanOptions.name === NAVIGATION_SPAN_NAME_FALLBACK;
  scope.setTransactionName(
    isFallbackSpanName ? (url && parseStringToURLObject(url)?.pathname) || WINDOW.location?.pathname : spanOptions.name,
  );

  // We store the normalized request data on the scope, so we get the request data at time of span creation
  // otherwise, the URL etc. may already be of the following navigation, and we'd report the wrong URL
  if (url && !isRedirect) {
    scope.setSDKProcessingMetadata({
      normalizedRequest: {
        ...getHttpRequestData(),
        url,
      },
    });
  }

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

/** Returns the description of a server timing entry */
export function getServerTiming(name: string): string | undefined {
  // The cast is required for the declaration build (`build:types`), which resolves
  // `getEntriesByType('navigation')` to `PerformanceEntry[]` (no `serverTiming`). It only reads as
  // "unnecessary" to the type-aware linter, which runs with web-vitals' global augmentation applied.
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
  const navigation = WINDOW.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  const entry = navigation?.serverTiming?.find(entry => entry.name === name);
  return entry?.description;
}

// We store the active idle span on the client object, so we can access it from exported functions
const ACTIVE_IDLE_SPAN_PROPERTY = '_sentry_idleSpan';
function getActiveIdleSpan(client: Client): Span | undefined {
  return (client as { [ACTIVE_IDLE_SPAN_PROPERTY]?: Span })[ACTIVE_IDLE_SPAN_PROPERTY];
}

function setActiveIdleSpan(client: Client, span: Span | undefined): void {
  addNonEnumerableProperty(client, ACTIVE_IDLE_SPAN_PROPERTY, span);
}

// The max. time in seconds between two pageload/navigation spans that makes us consider the second one a redirect
const REDIRECT_THRESHOLD = 1.5;

function isRedirect(activeSpan: Span, lastInteractionTimestamp: number | undefined): boolean {
  const spanData = spanToJSON(activeSpan);

  const now = dateTimestampInSeconds();

  // More than REDIRECT_THRESHOLD seconds since last navigation/pageload span?
  // --> never consider this a redirect
  const startTimestamp = spanData.start_timestamp;
  if (now - startTimestamp > REDIRECT_THRESHOLD) {
    return false;
  }

  // A click happened in the last REDIRECT_THRESHOLD seconds?
  // --> never consider this a redirect
  if (lastInteractionTimestamp && now - lastInteractionTimestamp <= REDIRECT_THRESHOLD) {
    return false;
  }

  return true;
}
