import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, Transaction as TransactionType, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { startIdleTransaction } from '../hubextensions';
import { DEFAULT_IDLE_TIMEOUT, IdleTransaction } from '../idletransaction';
import { Span } from '../span';
import { SpanStatus } from '../spanstatus';
import { registerBackgroundTabDetection } from './backgroundtab';
import { MetricsInstrumentation } from './metrics';
import {
  defaultRequestInstrumentionOptions,
  registerRequestInstrumentation,
  RequestInstrumentationOptions,
} from './request';
import { defaultBeforeNavigate, defaultRoutingInstrumentation } from './router';
import { secToMs } from './utils';

export const DEFAULT_MAX_TRANSACTION_DURATION_SECONDS = 600;

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions extends RequestInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeout: number;

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
   * beforeNavigate is called before a pageload/navigation transaction is created and allows for users
   * to set custom transaction context. Defaults behaviour is to return `window.location.pathname`.
   *
   * If undefined is returned, a pageload/navigation transaction will not be created.
   */
  beforeNavigate(context: TransactionContext): TransactionContext | undefined;

  /**
   * Instrumentation that creates routing change transactions. By default creates
   * pageload and navigation transactions.
   */
  routingInstrumentation<T extends TransactionType>(
    startTransaction: (context: TransactionContext) => T | undefined,
    startTransactionOnPageLoad?: boolean,
    startTransactionOnLocationChange?: boolean,
  ): void;
}

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
  public options: BrowserTracingOptions = {
    beforeNavigate: defaultBeforeNavigate,
    idleTimeout: DEFAULT_IDLE_TIMEOUT,
    markBackgroundTransactions: true,
    maxTransactionDuration: DEFAULT_MAX_TRANSACTION_DURATION_SECONDS,
    routingInstrumentation: defaultRoutingInstrumentation,
    startTransactionOnLocationChange: true,
    startTransactionOnPageLoad: true,
    ...defaultRequestInstrumentionOptions,
  };

  /**
   * @inheritDoc
   */
  public name: string = BrowserTracing.id;

  private _getCurrentHub?: () => Hub;

  private readonly _metrics: MetricsInstrumentation = new MetricsInstrumentation();

  private readonly _emitOptionsWarning: boolean = false;

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    let tracingOrigins = defaultRequestInstrumentionOptions.tracingOrigins;
    // NOTE: Logger doesn't work in constructors, as it's initialized after integrations instances
    if (
      _options &&
      _options.tracingOrigins &&
      Array.isArray(_options.tracingOrigins) &&
      _options.tracingOrigins.length !== 0
    ) {
      tracingOrigins = _options.tracingOrigins;
    } else {
      this._emitOptionsWarning = true;
    }

    this.options = {
      ...this.options,
      ..._options,
      tracingOrigins,
    };
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
        `[Tracing] We added a reasonable default for you: ${defaultRequestInstrumentionOptions.tracingOrigins}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      routingInstrumentation,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad,
      markBackgroundTransactions,
      traceFetch,
      traceXHR,
      tracingOrigins,
      shouldCreateSpanForRequest,
    } = this.options;

    routingInstrumentation(
      (context: TransactionContext) => this._createRouteTransaction(context),
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
    );

    if (markBackgroundTransactions) {
      registerBackgroundTabDetection();
    }

    registerRequestInstrumentation({ traceFetch, traceXHR, tracingOrigins, shouldCreateSpanForRequest });
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(context: TransactionContext): TransactionType | undefined {
    if (!this._getCurrentHub) {
      logger.warn(`[Tracing] Did not create ${context.op} idleTransaction due to invalid _getCurrentHub`);
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeNavigate, idleTimeout, maxTransactionDuration } = this.options;

    // if beforeNavigate returns undefined, we should not start a transaction.
    const ctx = beforeNavigate({
      ...context,
      ...getHeaderContext(),
      trimEnd: true,
    });

    if (ctx === undefined) {
      logger.log(`[Tracing] Did not create ${context.op} idleTransaction due to beforeNavigate`);
      return undefined;
    }

    const hub = this._getCurrentHub();
    logger.log(`[Tracing] starting ${ctx.op} idleTransaction on scope`);
    const idleTransaction = startIdleTransaction(hub, ctx, idleTimeout, true);
    idleTransaction.registerBeforeFinishCallback((transaction, endTimestamp) => {
      this._metrics.addPerformanceEntires(transaction);
      adjustTransactionDuration(secToMs(maxTransactionDuration), transaction, endTimestamp);
    });

    return idleTransaction as TransactionType;
  }
}

/**
 * Gets transaction context from a sentry-trace meta.
 */
function getHeaderContext(): Partial<TransactionContext> {
  const header = getMetaContent('sentry-trace');
  if (header) {
    const span = Span.fromTraceparent(header);
    if (span) {
      return {
        parentSpanId: span.parentSpanId,
        sampled: span.sampled,
        traceId: span.traceId,
      };
    }
  }

  return {};
}

/** Returns the value of a meta tag */
export function getMetaContent(metaName: string): string | null {
  const el = document.querySelector(`meta[name=${metaName}]`);
  return el ? el.getAttribute('content') : null;
}

/** Adjusts transaction value based on max transaction duration */
function adjustTransactionDuration(maxDuration: number, transaction: IdleTransaction, endTimestamp: number): void {
  const diff = endTimestamp - transaction.startTimestamp;
  const isOutdatedTransaction = endTimestamp && (diff > maxDuration || diff < 0);
  if (isOutdatedTransaction) {
    transaction.setStatus(SpanStatus.DeadlineExceeded);
    transaction.setTag('maxTransactionDurationExceeded', 'true');
  }
}
