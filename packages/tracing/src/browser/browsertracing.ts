import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, Transaction, TransactionContext } from '@sentry/types';
import { getGlobalObject, logger } from '@sentry/utils';

import { startIdleTransaction } from '../hubextensions';
import { DEFAULT_FINAL_TIMEOUT, DEFAULT_IDLE_TIMEOUT, IdleTransaction } from '../idletransaction';
import { extractTraceparentData, secToMs } from '../utils';
import { registerBackgroundTabDetection } from './backgroundtab';
import { MetricsInstrumentation } from './metrics';
import {
  defaultRequestInstrumentationOptions,
  instrumentOutgoingRequests,
  RequestInstrumentationOptions,
} from './request';
import { instrumentRoutingWithDefaults } from './router';

export const DEFAULT_MAX_TRANSACTION_DURATION_SECONDS = 600;

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions extends RequestInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   *
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeout: number;

  /**
   * The max transaction duration for a transaction. If a transaction duration hits the `finalTimeout` value, it
   * will be finished.
   *
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
   * The maximum duration of a transaction before it will be marked as "deadline_exceeded".
   * If you never want to mark a transaction set it to 0.
   * Time is in seconds.
   *
   * Default: 600
   */
  maxTransactionDuration: number;

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
  maxTransactionDuration: DEFAULT_MAX_TRANSACTION_DURATION_SECONDS,
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
  /**
   * @inheritDoc
   */
  public static id: string = 'BrowserTracing';

  /** Browser Tracing integration options */
  public options: BrowserTracingOptions;

  /**
   * @inheritDoc
   */
  public name: string = BrowserTracing.id;

  private _getCurrentHub?: () => Hub;

  private readonly _metrics: MetricsInstrumentation;

  private readonly _emitOptionsWarning: boolean = false;

  /** Store configured idle timeout so that it can be added as a tag to transactions */
  private _configuredIdleTimeout: BrowserTracingOptions['idleTimeout'] | undefined = undefined;

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    let tracingOrigins = defaultRequestInstrumentationOptions.tracingOrigins;
    // NOTE: Logger doesn't work in constructors, as it's initialized after integrations instances
    if (_options) {
      this._configuredIdleTimeout = _options.idleTimeout;
      if (_options.tracingOrigins && Array.isArray(_options.tracingOrigins) && _options.tracingOrigins.length !== 0) {
        tracingOrigins = _options.tracingOrigins;
      } else {
        this._emitOptionsWarning = true;
      }
    }

    this.options = {
      ...DEFAULT_BROWSER_TRACING_OPTIONS,
      ..._options,
      tracingOrigins,
    };

    const { _metricOptions } = this.options;
    this._metrics = new MetricsInstrumentation(_metricOptions && _metricOptions._reportAllChanges);
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._getCurrentHub = getCurrentHub;

    if (this._emitOptionsWarning) {
      logger.warn(
        '[Tracing] You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
      );
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
      logger.warn(`[Tracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`);
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeNavigate, idleTimeout, maxTransactionDuration } = this.options;

    const parentContextFromHeader = context.op === 'pageload' ? getHeaderContext() : undefined;

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
      logger.log(`[Tracing] Will not send ${finalContext.op} transaction because of beforeNavigate.`);
    }

    logger.log(`[Tracing] Starting ${finalContext.op} transaction on scope`);

    const hub = this._getCurrentHub();
    const { location } = getGlobalObject() as WindowOrWorkerGlobalScope & { location: Location };

    const idleTransaction = startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      true,
      { location }, // for use in the tracesSampler
    );
    idleTransaction.registerBeforeFinishCallback((transaction, endTimestamp) => {
      this._metrics.addPerformanceEntries(transaction);
      adjustTransactionDuration(secToMs(maxTransactionDuration), transaction, endTimestamp);
    });

    idleTransaction.setTag('idleTimeout', this._configuredIdleTimeout);

    return idleTransaction as Transaction;
  }
}

/**
 * Gets transaction context from a sentry-trace meta.
 *
 * @returns Transaction context data from the header or undefined if there's no header or the header is malformed
 */
export function getHeaderContext(): Partial<TransactionContext> | undefined {
  const header = getMetaContent('sentry-trace');
  if (header) {
    return extractTraceparentData(header);
  }

  return undefined;
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | null {
  const el = getGlobalObject<Window>().document.querySelector(`meta[name=${metaName}]`);
  return el ? el.getAttribute('content') : null;
}

/** Adjusts transaction value based on max transaction duration */
function adjustTransactionDuration(maxDuration: number, transaction: IdleTransaction, endTimestamp: number): void {
  const diff = endTimestamp - transaction.startTimestamp;
  const isOutdatedTransaction = endTimestamp && (diff > maxDuration || diff < 0);
  if (isOutdatedTransaction) {
    transaction.setStatus('deadline_exceeded');
    transaction.setTag('maxTransactionDurationExceeded', 'true');
  }
}
