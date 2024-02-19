/* eslint-disable max-lines */
import type { IdleTransaction } from '@sentry/core';
import { getActiveSpan } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  addTracingExtensions,
  getActiveTransaction,
  spanToJSON,
  startIdleTransaction,
} from '@sentry/core';
import type {
  Client,
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
  propagationContextFromHeaders,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { registerBackgroundTabDetection } from './backgroundtab';
import {
  addPerformanceEntries,
  startTrackingInteractions,
  startTrackingLongTasks,
  startTrackingWebVitals,
} from './metrics';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request';
import { WINDOW } from './types';

export const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions {
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
  _experiments: {},
  ...defaultRequestInstrumentationOptions,
};

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library. This integration uses {@see IdleTransaction} to create transactions.
 *
 * We explicitly export the proper type here, as this has to be extended in some cases.
 */
export const browserTracingIntegration = ((_options: Partial<BrowserTracingOptions> = {}) => {
  addTracingExtensions();

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

    let expandedContext: TransactionContext;
    if (isPageloadTransaction) {
      const sentryTrace = isPageloadTransaction ? getMetaContent('sentry-trace') : '';
      const baggage = isPageloadTransaction ? getMetaContent('baggage') : undefined;
      const { traceId, dsc, parentSpanId, sampled } = propagationContextFromHeaders(sentryTrace, baggage);
      expandedContext = {
        traceId,
        parentSpanId,
        parentSampled: sampled,
        ...context,
        metadata: {
          // eslint-disable-next-line deprecation/deprecation
          ...context.metadata,
          dynamicSamplingContext: dsc,
        },
        trimEnd: true,
      };
    } else {
      expandedContext = {
        trimEnd: true,
        ...context,
      };
    }

    const finalContext = beforeStartSpan ? beforeStartSpan(expandedContext) : expandedContext;

    // If `beforeStartSpan` set a custom name, record that fact
    finalContext.attributes =
      finalContext.name !== expandedContext.name
        ? { ...finalContext.attributes, [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' }
        : finalContext.attributes;

    latestRouteName = finalContext.name;
    if (finalContext.attributes) {
      latestRouteSource = finalContext.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
    }

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

    if (isPageloadTransaction && WINDOW.document) {
      WINDOW.document.addEventListener('readystatechange', () => {
        if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
          idleTransaction.sendAutoFinishSignal();
        }
      });

      if (['interactive', 'complete'].includes(WINDOW.document.readyState)) {
        idleTransaction.sendAutoFinishSignal();
      }
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
      const { markBackgroundSpan, traceFetch, traceXHR, shouldCreateSpanForRequest, enableHTTPTimings, _experiments } =
        options;

      let activeSpan: Span | undefined;
      let startingUrl: string | undefined = WINDOW.location && WINDOW.location.href;

      client.on('startNavigationSpan', (context: StartSpanOptions) => {
        if (activeSpan) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current transaction with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeSpan.end();
        }
        activeSpan = _createRouteTransaction({
          op: 'navigation',
          ...context,
        });
      });

      client.on('startPageLoadSpan', (context: StartSpanOptions) => {
        if (activeSpan) {
          DEBUG_BUILD && logger.log(`[Tracing] Finishing current transaction with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open transaction on the scope, we need to finish it before creating an new one.
          activeSpan.end();
        }
        activeSpan = _createRouteTransaction({
          op: 'pageload',
          ...context,
        });
      });

      if (options.instrumentPageLoad && WINDOW.location) {
        const context: StartSpanOptions = {
          name: WINDOW.location.pathname,
          // pageload should always start at timeOrigin (and needs to be in s, not ms)
          startTimestamp: browserPerformanceTimeOrigin ? browserPerformanceTimeOrigin / 1000 : undefined,
          origin: 'auto.pageload.browser',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          },
        };
        startBrowserTracingPageLoadSpan(client, context);
      }

      if (options.instrumentNavigation && WINDOW.location) {
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
            const context: StartSpanOptions = {
              name: WINDOW.location.pathname,
              origin: 'auto.navigation.browser',
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              },
            };

            startBrowserTracingNavigationSpan(client, context);
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
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
        shouldCreateSpanForRequest,
        enableHTTPTimings,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Manually start a page load span.
 * This will only do something if the BrowserTracing integration has been setup.
 */
export function startBrowserTracingPageLoadSpan(client: Client, spanOptions: StartSpanOptions): Span | undefined {
  client.emit('startPageLoadSpan', spanOptions);

  const span = getActiveSpan();
  const op = span && spanToJSON(span).op;
  return op === 'pageload' ? span : undefined;
}

/**
 * Manually start a navigation span.
 * This will only do something if the BrowserTracing integration has been setup.
 */
export function startBrowserTracingNavigationSpan(client: Client, spanOptions: StartSpanOptions): Span | undefined {
  client.emit('startNavigationSpan', spanOptions);

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
