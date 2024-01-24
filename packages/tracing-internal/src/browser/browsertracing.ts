/* eslint-disable max-lines, complexity */
import type { Hub, IdleTransaction } from '@sentry/core';
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
  EventProcessor,
  Integration,
  StartSpanOptions,
  Transaction,
  TransactionContext,
  TransactionSource,
} from '@sentry/types';
import { getDomElement, logger, tracingContextFromHeaders } from '@sentry/utils';

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
import { instrumentRoutingWithDefaults } from './router';
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
   * If a span should be created on location (history) changes.
   * Default: true
   */
  spanOnLocationChange: boolean;

  /**
   * If a span should be created on pageload.
   * Default: true
   */
  spanOnPageLoad: boolean;

  /**
   * Flag spans where tabs moved to background with "cancelled". Browser background tab timing is
   * not suited towards doing precise measurements of operations. By default, we recommend that this option
   * be enabled as background transactions can mess up your statistics in nondeterministic ways.
   *
   * Default: true
   */
  markBackgroundSpan: boolean;

  /**
   * Flag to enable/disable creation of `navigation` transaction on history changes.
   * Default: true
   * @deprecated Configure `spanOnLocationChange` instead.
   */
  startTransactionOnLocationChange?: boolean;

  /**
   * Flag to enable/disable creation of `pageload` transaction on first pageload.
   * Default: true
   * @deprecated Configure `spanOnPageLoad` instead.
   */
  startTransactionOnPageLoad?: boolean;

  /**
   * Flag Transactions where tabs moved to background with "cancelled". Browser background tab timing is
   * not suited towards doing precise measurements of operations. By default, we recommend that this option
   * be enabled as background transactions can mess up your statistics in nondeterministic ways.
   * Default: true
   * @deprecated Configure `markBackgroundSpan` instead.
   */
  markBackgroundTransactions?: boolean;

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
    enableLongTask: boolean;
    enableInteractions: boolean;
    onStartRouteTransaction: (t: Transaction | undefined, ctx: TransactionContext, getCurrentHub: () => Hub) => void;
  }>;

  /**
   * A callback which is called before a span for a pageload or navigation is started.
   * It receives the options passed to `startSpan`, and expects to return an updated options object.
   */
  beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;

  /**
   * beforeNavigate is called before a pageload/navigation transaction is created and allows users to modify transaction
   * context data, or drop the transaction entirely (by setting `sampled = false` in the context).
   *
   * Note: For legacy reasons, transactions can also be dropped by returning `undefined`.
   *
   * @param context: The context data which will be passed to `startTransaction` by default
   *
   * @returns A (potentially) modified context object, with `sampled = false` if the transaction should be dropped.
   *
   * @deprecated Use `beforeStartSpan` instead.
   */
  beforeNavigate?(this: void, context: TransactionContext): TransactionContext | undefined;

  /**
   * Instrumentation that creates routing change transactions. By default creates
   * pageload and navigation transactions.
   */
  routingInstrumentation<T extends Transaction>(
    this: void,
    customStartTransaction: (context: TransactionContext) => T | undefined,
    startTransactionOnPageLoad?: boolean,
    startTransactionOnLocationChange?: boolean,
  ): void;
}

const DEFAULT_BROWSER_TRACING_OPTIONS: BrowserTracingOptions = {
  ...TRACING_DEFAULTS,
  routingInstrumentation: instrumentRoutingWithDefaults,
  spanOnLocationChange: true,
  spanOnPageLoad: true,
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
 */
export function browserTracingIntegration(options?: Partial<BrowserTracingOptions>): Integration {
  // eslint-disable-next-line deprecation/deprecation
  return new BrowserTracing(options);
}

/**
 * @deprecated Use `browserTracingIntegration()` instead.
 */
export class BrowserTracing implements Integration {
  // This class currently doesn't have a static `id` field like the other integration classes, because it prevented
  // @sentry/tracing from being treeshaken. Tree shakers do not like static fields, because they behave like side effects.
  // TODO: Come up with a better plan, than using static fields on integration classes, and use that plan on all
  // integrations.

  /** Browser Tracing integration options */
  public options: BrowserTracingOptions;

  /**
   * @inheritDoc
   */
  public name: string;

  private _getCurrentHub?: () => Hub;

  private _latestRouteName?: string;
  private _latestRouteSource?: TransactionSource;

  private _collectWebVitals: () => void;

  private _hasSetTracePropagationTargets: boolean;

  public constructor(_options: Partial<BrowserTracingOptions> = {}) {
    this.name = BROWSER_TRACING_INTEGRATION_ID;
    this._hasSetTracePropagationTargets = false;

    addTracingExtensions();

    if (DEBUG_BUILD) {
      this._hasSetTracePropagationTargets = !!(
        // eslint-disable-next-line deprecation/deprecation
        (_options.tracePropagationTargets || _options.tracingOrigins)
      );
    }

    // Migrate legacy options
    // TODO v8: Remove this
    /* eslint-disable deprecation/deprecation */
    if (typeof _options.startTransactionOnPageLoad === 'boolean') {
      _options.spanOnPageLoad = _options.startTransactionOnPageLoad;
    }
    if (typeof _options.startTransactionOnLocationChange === 'boolean') {
      _options.spanOnLocationChange = _options.startTransactionOnLocationChange;
    }
    if (typeof _options.markBackgroundTransactions === 'boolean') {
      _options.markBackgroundSpan = _options.markBackgroundTransactions;
    }
    /* eslint-enable deprecation/deprecation */

    // TODO (v8): remove this block after tracingOrigins is removed
    // Set tracePropagationTargets to tracingOrigins if specified by the user
    // In case both are specified, tracePropagationTargets takes precedence
    // eslint-disable-next-line deprecation/deprecation
    if (!_options.tracePropagationTargets && _options.tracingOrigins) {
      // eslint-disable-next-line deprecation/deprecation
      _options.tracePropagationTargets = _options.tracingOrigins;
    }

    this.options = {
      ...DEFAULT_BROWSER_TRACING_OPTIONS,
      ..._options,
    };

    // Special case: enableLongTask can be set in _experiments
    // TODO (v8): Remove this in v8
    if (this.options._experiments.enableLongTask !== undefined) {
      this.options.enableLongTask = this.options._experiments.enableLongTask;
    }

    this._collectWebVitals = startTrackingWebVitals();
    if (this.options.enableLongTask) {
      startTrackingLongTasks();
    }
    if (this.options._experiments.enableInteractions) {
      startTrackingInteractions();
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._getCurrentHub = getCurrentHub;
    const hub = getCurrentHub();
    // eslint-disable-next-line deprecation/deprecation
    const client = hub.getClient();
    const clientOptions = client && client.getOptions();

    const {
      routingInstrumentation: instrumentRouting,
      spanOnPageLoad,
      spanOnLocationChange,
      markBackgroundSpan,
      traceFetch,
      traceXHR,
      shouldCreateSpanForRequest,
      enableHTTPTimings,
      _experiments,
    } = this.options;

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
    const tracePropagationTargets = clientOptionsTracePropagationTargets || this.options.tracePropagationTargets;
    if (DEBUG_BUILD && this._hasSetTracePropagationTargets && clientOptionsTracePropagationTargets) {
      logger.warn(
        '[Tracing] The `tracePropagationTargets` option was set in the BrowserTracing integration and top level `Sentry.init`. The top level `Sentry.init` value is being used.',
      );
    }

    instrumentRouting(
      (context: TransactionContext) => {
        const transaction = this._createRouteTransaction(context);

        this.options._experiments.onStartRouteTransaction &&
          this.options._experiments.onStartRouteTransaction(transaction, context, getCurrentHub);

        return transaction;
      },
      spanOnPageLoad,
      spanOnLocationChange,
    );

    if (markBackgroundSpan) {
      registerBackgroundTabDetection();
    }

    if (_experiments.enableInteractions) {
      this._registerInteractionListener();
    }

    instrumentOutgoingRequests({
      traceFetch,
      traceXHR,
      tracePropagationTargets,
      shouldCreateSpanForRequest,
      enableHTTPTimings,
    });
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(context: TransactionContext): Transaction | undefined {
    if (!this._getCurrentHub) {
      DEBUG_BUILD &&
        logger.warn(`[Tracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`);
      return undefined;
    }

    const hub = this._getCurrentHub();

    const {
      // eslint-disable-next-line deprecation/deprecation
      beforeNavigate,
      beforeStartSpan,
      idleTimeout,
      finalTimeout,
      heartbeatInterval,
    } = this.options;

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

    const contextAfterProcessing = beforeStartSpan ? beforeStartSpan(expandedContext) : expandedContext;

    const modifiedContext =
      // eslint-disable-next-line deprecation/deprecation
      typeof beforeNavigate === 'function' ? beforeNavigate(contextAfterProcessing) : contextAfterProcessing;

    // For backwards compatibility reasons, beforeNavigate can return undefined to "drop" the transaction (prevent it
    // from being sent to Sentry).
    const finalContext = modifiedContext === undefined ? { ...expandedContext, sampled: false } : modifiedContext;

    // If `beforeNavigate` set a custom name, record that fact
    // eslint-disable-next-line deprecation/deprecation
    finalContext.metadata =
      finalContext.name !== expandedContext.name
        ? // eslint-disable-next-line deprecation/deprecation
          { ...finalContext.metadata, source: 'custom' }
        : // eslint-disable-next-line deprecation/deprecation
          finalContext.metadata;

    this._latestRouteName = finalContext.name;

    // eslint-disable-next-line deprecation/deprecation
    const sourceFromData = context.data && context.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
    // eslint-disable-next-line deprecation/deprecation
    const sourceFromMetadata = finalContext.metadata && finalContext.metadata.source;

    this._latestRouteSource = sourceFromData || sourceFromMetadata;

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
      this._collectWebVitals();
      addPerformanceEntries(transaction);
    });

    return idleTransaction as Transaction;
  }

  /** Start listener for interaction transactions */
  private _registerInteractionListener(): void {
    let inflightInteractionTransaction: IdleTransaction | undefined;
    const registerInteractionTransaction = (): void => {
      const { idleTimeout, finalTimeout, heartbeatInterval } = this.options;
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

      if (!this._getCurrentHub) {
        DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _getCurrentHub is invalid.`);
        return undefined;
      }

      if (!this._latestRouteName) {
        DEBUG_BUILD && logger.warn(`[Tracing] Did not create ${op} transaction because _latestRouteName is missing.`);
        return undefined;
      }

      const hub = this._getCurrentHub();
      const { location } = WINDOW;

      const context: TransactionContext = {
        name: this._latestRouteName,
        op,
        trimEnd: true,
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: this._latestRouteSource || 'url',
        },
      };

      inflightInteractionTransaction = startIdleTransaction(
        hub,
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
