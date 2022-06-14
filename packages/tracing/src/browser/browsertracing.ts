import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, Transaction, TransactionContext } from '@sentry/types';
import { getGlobalObject, logger, parseBaggageSetMutability } from '@sentry/utils';

import { startIdleTransaction } from '../hubextensions';
import { DEFAULT_FINAL_TIMEOUT, DEFAULT_IDLE_TIMEOUT } from '../idletransaction';
import { extractTraceparentData } from '../utils';
import { registerBackgroundTabDetection } from './backgroundtab';
import { addPerformanceEntries, startTrackingWebVitals } from './metrics';
import {
  defaultRequestInstrumentationOptions,
  instrumentOutgoingRequests,
  RequestInstrumentationOptions,
} from './request';
import { instrumentRoutingWithDefaults } from './router';

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
   * Flag to enable/disable creation of `navigation` transaction on history changes.
   *
   * Default: true
   */
  startTransactionOnLocationChange: boolean;

  /**
   * Flag to enable/disable creation of `pageload` transaction on first pageload.
   *
   * Default: true
   */
  startTransactionOnPageLoad: boolean;

  /**
   * Flag Transactions where tabs moved to background with "cancelled". Browser background tab timing is
   * not suited towards doing precise measurements of operations. By default, we recommend that this option
   * be enabled as background transactions can mess up your statistics in nondeterministic ways.
   *
   * Default: true
   */
  markBackgroundTransactions: boolean;

  /**
   * _metricOptions allows the user to send options to change how metrics are collected.
   *
   * _metricOptions is currently experimental.
   *
   * Default: undefined
   */
  _metricOptions?: Partial<{ _reportAllChanges: boolean }>;

  /**
   * beforeNavigate is called before a pageload/navigation transaction is created and allows users to modify transaction
   * context data, or drop the transaction entirely (by setting `sampled = false` in the context).
   *
   * Note: For legacy reasons, transactions can also be dropped by returning `undefined`.
   *
   * @param context: The context data which will be passed to `startTransaction` by default
   *
   * @returns A (potentially) modified context object, with `sampled = false` if the transaction should be dropped.
   */
  beforeNavigate?(context: TransactionContext): TransactionContext | undefined;

  /**
   * Instrumentation that creates routing change transactions. By default creates
   * pageload and navigation transactions.
   */
  routingInstrumentation<T extends Transaction>(
    customStartTransaction: (context: TransactionContext) => T | undefined,
    startTransactionOnPageLoad?: boolean,
    startTransactionOnLocationChange?: boolean,
  ): void;
}

const DEFAULT_BROWSER_TRACING_OPTIONS = {
  idleTimeout: DEFAULT_IDLE_TIMEOUT,
  finalTimeout: DEFAULT_FINAL_TIMEOUT,
  markBackgroundTransactions: true,
  routingInstrumentation: instrumentRoutingWithDefaults,
  startTransactionOnLocationChange: true,
  startTransactionOnPageLoad: true,
  ...defaultRequestInstrumentationOptions,
};

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library. This integration uses {@see IdleTransaction} to create transactions.
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
  public name: string = BROWSER_TRACING_INTEGRATION_ID;

  private _getCurrentHub?: () => Hub;

  private readonly _emitOptionsWarning?: boolean;

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    let tracingOrigins = defaultRequestInstrumentationOptions.tracingOrigins;
    // NOTE: Logger doesn't work in constructors, as it's initialized after integrations instances
    if (_options) {
      if (_options.tracingOrigins && Array.isArray(_options.tracingOrigins) && _options.tracingOrigins.length !== 0) {
        tracingOrigins = _options.tracingOrigins;
      } else {
        __DEBUG_BUILD__ && (this._emitOptionsWarning = true);
      }
    }

    this.options = {
      ...DEFAULT_BROWSER_TRACING_OPTIONS,
      ..._options,
      tracingOrigins,
    };

    const { _metricOptions } = this.options;
    startTrackingWebVitals(_metricOptions && _metricOptions._reportAllChanges);
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._getCurrentHub = getCurrentHub;

    if (this._emitOptionsWarning) {
      __DEBUG_BUILD__ &&
        logger.warn(
          '[Tracing] You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
        );
      __DEBUG_BUILD__ &&
        logger.warn(
          `[Tracing] We added a reasonable default for you: ${defaultRequestInstrumentationOptions.tracingOrigins}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      routingInstrumentation: instrumentRouting,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad,
      markBackgroundTransactions,
      traceFetch,
      traceXHR,
      tracingOrigins,
      shouldCreateSpanForRequest,
    } = this.options;

    instrumentRouting(
      (context: TransactionContext) => this._createRouteTransaction(context),
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
    );

    if (markBackgroundTransactions) {
      registerBackgroundTabDetection();
    }

    instrumentOutgoingRequests({ traceFetch, traceXHR, tracingOrigins, shouldCreateSpanForRequest });
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(context: TransactionContext): Transaction | undefined {
    if (!this._getCurrentHub) {
      __DEBUG_BUILD__ &&
        logger.warn(`[Tracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`);
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeNavigate, idleTimeout, finalTimeout } = this.options;

    const parentContextFromHeader = context.op === 'pageload' ? extractTraceDataFromMetaTags() : undefined;

    const expandedContext = {
      ...context,
      ...parentContextFromHeader,
      trimEnd: true,
    };
    const modifiedContext = typeof beforeNavigate === 'function' ? beforeNavigate(expandedContext) : expandedContext;

    // For backwards compatibility reasons, beforeNavigate can return undefined to "drop" the transaction (prevent it
    // from being sent to Sentry).
    const finalContext = modifiedContext === undefined ? { ...expandedContext, sampled: false } : modifiedContext;

    if (finalContext.sampled === false) {
      __DEBUG_BUILD__ &&
        logger.log(`[Tracing] Will not send ${finalContext.op} transaction because of beforeNavigate.`);
    }

    __DEBUG_BUILD__ && logger.log(`[Tracing] Starting ${finalContext.op} transaction on scope`);

    const hub = this._getCurrentHub();
    const { location } = getGlobalObject() as WindowOrWorkerGlobalScope & { location: Location };

    const idleTransaction = startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      finalTimeout,
      true,
      { location }, // for use in the tracesSampler
    );
    idleTransaction.registerBeforeFinishCallback(transaction => {
      addPerformanceEntries(transaction);
      transaction.setTag(
        'sentry_reportAllChanges',
        Boolean(this.options._metricOptions && this.options._metricOptions._reportAllChanges),
      );
    });

    return idleTransaction as Transaction;
  }
}

/**
 * Gets transaction context data from `sentry-trace` and `baggage` <meta> tags.
 * @returns Transaction context data or undefined neither tag exists or has valid data
 */
export function extractTraceDataFromMetaTags(): Partial<TransactionContext> | undefined {
  const sentrytraceValue = getMetaContent('sentry-trace');
  const baggageValue = getMetaContent('baggage');

  const sentrytraceData = sentrytraceValue ? extractTraceparentData(sentrytraceValue) : undefined;
  const baggage = parseBaggageSetMutability(baggageValue, sentrytraceValue);

  // TODO more extensive checks for baggage validity/emptyness?
  if (sentrytraceData || baggage) {
    return {
      ...(sentrytraceData && sentrytraceData),
      ...(baggage && { metadata: { baggage } }),
    };
  }

  return undefined;
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | null {
  const globalObject = getGlobalObject<Window>();

  // DOM/querySelector is not available in all environments
  if (globalObject.document && globalObject.document.querySelector) {
    const el = globalObject.document.querySelector(`meta[name=${metaName}]`);
    return el ? el.getAttribute('content') : null;
  } else {
    return null;
  }
}
