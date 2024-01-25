/* eslint-disable max-lines, complexity */
import type { IdleTransaction } from '@sentry/core';
import { getClient } from '@sentry/core';
import { defineIntegration, getCurrentHub } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  addTracingExtensions,
  getActiveTransaction,
  spanIsSampled,
  spanToJSON,
  startIdleTransaction,
} from '@sentry/core';
import type {
  IntegrationFn,
  StartSpanOptions,
  Transaction,
  TransactionContext,
  TransactionSource,
} from '@sentry/types';
import type { Span } from '@sentry/types';
import {
  addHistoryInstrumentationHandler,
  browserPerformanceTimeOrigin,
  getDomElement,
  logger,
  tracingContextFromHeaders,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { registerBackgroundTabDetection } from './backgroundtab';
import {
  addPerformanceEntries,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingWebVitals,
} from './metrics';
import type { RequestInstrumentationOptions } from './request';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request';
import { WINDOW } from './types';

export const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions extends RequestInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished during an idle state. An idle state is defined
   * by a moment where there are no in-progress spans.
   *
   * The transaction will use the end timestamp of the last finished span as the endtime for the transaction.
   * If there are still active spans when this the `idleTimeout` is set, the `idleTimeout` will get reset.
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeout: number;

  /**
   * The max duration for a transaction. If a transaction duration hits the `finalTimeout` value, it
   * will be finished.
   * Time is in ms.
   *
   * Default: 30000
   */
  finalTimeout: number;

  /**
   * The heartbeat interval. If no new spans are started or open spans are finished within 3 heartbeats,
   * the transaction will be finished.
   * Time is in ms.
   *
   * Default: 5000
   */
  heartbeatInterval: number;

  /**
   * If a span should be created on page load.
   * Default: true
   */
  instrumentPageLoad: boolean;

  /**
   * If a span should be created on navigation (history change).
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
   * _metricOptions allows the user to send options to change how metrics are collected.
   *
   * _metricOptions is currently experimental.
   *
   * Default: undefined
   */
  _metricOptions?: Partial<{
    /**
     * @deprecated This property no longer has any effect and will be removed in v8.
     */
    _reportAllChanges: boolean;
  }>;

  /**
   * _experiments allows the user to send options to define how this integration works.
   * Note that the `enableLongTask` options is deprecated in favor of the option at the top level, and will be removed in v8.
   *
   * TODO (v8): Remove enableLongTask
   *
   * Default: undefined
   */
  _experiments: Partial<{
    enableInteractions: boolean;
  }>;

  /**
   * A callback which is called before a span for a pageload or navigation is started.
   * It receives the options passed to `startSpan`, and expects to return an updated options object.
   */
  beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  instrumentNavigation: true,
  instrumentPageLoad: true,
  markBackgroundSpan: true,
  enableLongTask: true,
  _experiments: {},
  ...defaultRequestInstrumentationOptions,
};

let shouldUseDefaultPageLoadSpan = true;
let shouldUseDefaultNavigationSpan = true;

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library. This integration uses {@see IdleTransaction} to create transactions.
 */
export const _browserTracingIntegration = ((_options: Partial<BrowserTracingOptions> = {}) => {
  const _hasSetTracePropagationTargets = DEBUG_BUILD
    ? !!(
        // eslint-disable-next-line deprecation/deprecation
        (_options.tracePropagationTargets || _options.tracingOrigins)
      )
    : false;

  addTracingExtensions();

  // TODO (v8): remove this block after tracingOrigins is removed
  // Set tracePropagationTargets to tracingOrigins if specified by the user
  // In case both are specified, tracePropagationTargets takes precedence
  // eslint-disable-next-line deprecation/deprecation
  if (!_options.tracePropagationTargets && _options.tracingOrigins) {
    // eslint-disable-next-line deprecation/deprecation
    _options.tracePropagationTargets = _options.tracingOrigins;
  }

  const options = {
    ...DEFAULT_BROWSER_TRACING_OPTIONS,
    ..._options,
  };

  const _collectWebVitals = startTrackingWebVitals();

  if (options.enableLongTask) {
    startTrackingLongTasks();
  }
  if (options._experiments.enableInteractions) {
    startTrackingInteractions();
  }

  let latestRouteName: string | undefined;
  let latestRouteSource: TransactionSource | undefined;

  /** Create routing idle transaction. */
  function _createRouteTransaction(context: TransactionContext): Transaction | undefined {
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();

    const { beforeStartSpan, idleTimeout, finalTimeout, heartbeatInterval } = options;

    const isPageloadTransaction = context.op === 'pageload';

    const sentryTrace = isPageloadTransaction ? getMetaContent('sentry-trace') : '';
    const baggage = isPageloadTransaction ? getMetaContent('baggage') : '';
    const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
      sentryTrace,
      baggage,
    );

    const expandedContext: TransactionContext = {
      ...context,
      ...traceparentData,
      metadata: {
        // eslint-disable-next-line deprecation/deprecation
        ...context.metadata,
        dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
      },
      trimEnd: true,
    };

    const finalContext = beforeStartSpan ? beforeStartSpan(expandedContext) : expandedContext;

    // If `beforeStartSpan` set a custom name, record that fact
    // eslint-disable-next-line deprecation/deprecation
    finalContext.metadata =
      finalContext.name !== expandedContext.name
        ? // eslint-disable-next-line deprecation/deprecation
          { ...finalContext.metadata, source: 'custom' }
        : // eslint-disable-next-line deprecation/deprecation
          finalContext.metadata;

    latestRouteName = finalContext.name;

    // eslint-disable-next-line deprecation/deprecation
    const sourceFromData = context.data && context.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
    // eslint-disable-next-line deprecation/deprecation
    const sourceFromMetadata = finalContext.metadata && finalContext.metadata.source;

    latestRouteSource = sourceFromData || sourceFromMetadata;

    // eslint-disable-next-line deprecation/deprecation
    if (finalContext.sampled === false) {
      DEBUG_BUILD && logger.log(`[Tracing] Will not send ${finalContext.op} transaction because of beforeNavigate.`);
    }

    DEBUG_BUILD && logger.log(`[Tracing] Starting ${finalContext.op} transaction on scope`);

    const { location } = WINDOW;

    const idleTransaction = startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      finalTimeout,
      true,
      { location }, // for use in the tracesSampler
      heartbeatInterval,
      isPageloadTransaction, // should wait for finish signal if it's a pageload transaction
    );

    if (isPageloadTransaction) {
      WINDOW.document.addEventListener('readystatechange', () => {
        if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
          idleTransaction.sendAutoFinishSignal();
        }
      });

      if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
        idleTransaction.sendAutoFinishSignal();
      }
    }

    // eslint-disable-next-line deprecation/deprecation
    const scope = hub.getScope();

    // If it's a pageload and there is a meta tag set
    // use the traceparentData as the propagation context
    if (isPageloadTransaction && traceparentData) {
      scope.setPropagationContext(propagationContext);
    } else {
      // Navigation transactions should set a new propagation context based on the
      // created idle transaction.
      scope.setPropagationContext({
        traceId: idleTransaction.spanContext().traceId,
        spanId: idleTransaction.spanContext().spanId,
        parentSpanId: spanToJSON(idleTransaction).parent_span_id,
        sampled: spanIsSampled(idleTransaction),
      });
    }

    idleTransaction.registerBeforeFinishCallback(transaction => {
      _collectWebVitals();
      addPerformanceEntries(transaction);
    });

    return idleTransaction as Transaction;
  }

  return {
    name: BROWSER_TRACING_INTEGRATION_ID,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce: () => {},
    afterAllSetup(client) {
      const clientOptions = client.getOptions();

      const { markBackgroundSpan, traceFetch, traceXHR, shouldCreateSpanForRequest, enableHTTPTimings, _experiments } =
        options;

      const clientOptionsTracePropagationTargets = clientOptions && clientOptions.tracePropagationTargets;
      // There are three ways to configure tracePropagationTargets:
      // 1. via top level client option `tracePropagationTargets`
      // 2. via BrowserTracing option `tracePropagationTargets`
      // 3. via BrowserTracing option `tracingOrigins` (deprecated)
      //
      // To avoid confusion, favour top level client option `tracePropagationTargets`, and fallback to
      // BrowserTracing option `tracePropagationTargets` and then `tracingOrigins` (deprecated).
      // This is done as it minimizes bundle size (we don't have to have undefined checks).
      //
      // If both 1 and either one of 2 or 3 are set (from above), we log out a warning.
      // eslint-disable-next-line deprecation/deprecation
      const tracePropagationTargets = clientOptionsTracePropagationTargets || options.tracePropagationTargets;
      if (DEBUG_BUILD && _hasSetTracePropagationTargets && clientOptionsTracePropagationTargets) {
        logger.warn(
          '[Tracing] The `tracePropagationTargets` option was set in the BrowserTracing integration and top level `Sentry.init`. The top level `Sentry.init` value is being used.',
        );
      }

      let activeSpan: Span | undefined;
      let startingUrl: string | undefined = WINDOW.location.href;

      if (client.on) {
        client.on('startNavigationSpan', (context: StartSpanOptions) => {
          if (!options.instrumentNavigation) {
            return;
          }

          if (activeSpan) {
            DEBUG_BUILD && logger.log(`[Tracing] Finishing current transaction with op: ${spanToJSON(activeSpan).op}`);
            // If there's an open transaction on the scope, we need to finish it before creating an new one.
            activeSpan.end();
          }
          activeSpan = _createRouteTransaction(context);
        });

        client.on('startPageLoadSpan', (context: StartSpanOptions) => {
          if (!options.instrumentPageLoad) {
            return;
          }

          if (activeSpan) {
            DEBUG_BUILD && logger.log(`[Tracing] Finishing current transaction with op: ${spanToJSON(activeSpan).op}`);
            // If there's an open transaction on the scope, we need to finish it before creating an new one.
            activeSpan.end();
          }
          activeSpan = _createRouteTransaction(context);
        });
      }

      if (options.instrumentPageLoad && client.emit && shouldUseDefaultPageLoadSpan) {
        const context: StartSpanOptions = {
          name: WINDOW.location.pathname,
          // pageload should always start at timeOrigin (and needs to be in s, not ms)
          startTimestamp: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
          op: 'pageload',
          origin: 'auto.pageload.browser',
          metadata: { source: 'url' },
        };
        startBrowserTracingPageLoadSpan(context);
      }

      if (options.instrumentNavigation && client.emit) {
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
            if (shouldUseDefaultNavigationSpan) {
              const context: StartSpanOptions = {
                name: WINDOW.location.pathname,
                op: 'navigation',
                origin: 'auto.navigation.browser',
                metadata: { source: 'url' },
              };

              startBrowserTracingNavigationSpan(context);
            }
          }
        });
      }

      if (markBackgroundSpan) {
        registerBackgroundTabDetection();
      }

      if (_experiments.enableInteractions) {
        registerInteractionListener(options, latestRouteName, latestRouteSource);
      }

      instrumentOutgoingRequests({
        traceFetch,
        traceXHR,
        tracePropagationTargets,
        shouldCreateSpanForRequest,
        enableHTTPTimings,
      });
    },
    // TODO v8: Remove this again
    // This is private API that we use to fix converted BrowserTracing integrations in Next.js & SvelteKit
    options,
  };
}) satisfies IntegrationFn;

export const browserTracingIntegration = defineIntegration(_browserTracingIntegration);

/**
 * Manually start a page load span.
 * This will only do something if the BrowserTracing integration has been setup.
 */
export function startBrowserTracingPageLoadSpan(spanOptions: StartSpanOptions): void {
  const client = getClient();
  if (!client || !client.emit) {
    return;
  }

  client.emit('startPageLoadSpan', spanOptions);
  shouldUseDefaultPageLoadSpan = false;
}

/**
 * Manually start a navigation span.
 * This will only do something if the BrowserTracing integration has been setup.
 */
export function startBrowserTracingNavigationSpan(spanOptions: StartSpanOptions): void {
  const client = getClient();
  if (!client || !client.emit) {
    return;
  }

  client.emit('startNavigationSpan', spanOptions);
  shouldUseDefaultNavigationSpan = false;
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
  options: BrowserTracingOptions,
  latestRouteName: string | undefined,
  latestRouteSource: TransactionSource | undefined,
): void {
  let inflightInteractionTransaction: IdleTransaction | undefined;
  const registerInteractionTransaction = (): void => {
    const { idleTimeout, finalTimeout, heartbeatInterval } = options;
    const op = 'ui.action.click';

    // eslint-disable-next-line deprecation/deprecation
    const currentTransaction = getActiveTransaction();
    if (currentTransaction && currentTransaction.op && ['navigation', 'pageload'].includes(currentTransaction.op)) {
      DEBUG_BUILD &&
        logger.warn(
          `[Tracing] Did not create ${op} transaction because a pageload or navigation transaction is in progress.`,
        );
      return undefined;
    }

    if (inflightInteractionTransaction) {
      inflightInteractionTransaction.setFinishReason('interactionInterrupted');
      inflightInteractionTransaction.end();
      inflightInteractionTransaction = undefined;
    }

    if (!latestRouteName) {
      DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _latestRouteName is missing.`);
      return undefined;
    }

    const { location } = WINDOW;

    const context: TransactionContext = {
      name: latestRouteName,
      op,
      trimEnd: true,
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: latestRouteSource || 'url',
      },
    };

    inflightInteractionTransaction = startIdleTransaction(
      // eslint-disable-next-line deprecation/deprecation
      getCurrentHub(),
      context,
      idleTimeout,
      finalTimeout,
      true,
      { location }, // for use in the tracesSampler
      heartbeatInterval,
    );
  };

  ['click'].forEach(type => {
    addEventListener(type, registerInteractionTransaction, { once: false, capture: true });
  });
}
