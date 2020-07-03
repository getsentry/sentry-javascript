import { Hub } from '@sentry/hub';
import { Event, EventProcessor, Integration, Severity, TransactionContext } from '@sentry/types';
import { logger, safeJoin } from '@sentry/utils';

import { IdleTransaction } from '../idletransaction';
import { Span as SpanClass } from '../span';
import { SpanStatus } from '../spanstatus';

import { registerBackgroundTabDetection } from './tracing/backgroundtab';
import { registerErrorHandlers } from './tracing/errors';
import { Metrics } from './tracing/performance';
import {
  defaultRequestInstrumentionOptions,
  RequestInstrumentationClass,
  RequestInstrumentationOptions,
  RequestTracing,
} from './tracing/request';
import {
  defaultRoutingInstrumentationOptions,
  RouterTracing,
  RoutingInstrumentationClass,
  RoutingInstrumentationOptions,
} from './tracing/router';

/**
 * Options for Browser Tracing integration
 */
export type BrowserTracingOptions = {
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
   * not suited towards doing precise measurements of operations. Background transaction can mess up your
   * statistics in non deterministic ways that's why we by default recommend leaving this opition enabled.
   *
   * Default: true
   */
  markBackgroundTransactions: boolean;

  /**
   * This is only if you want to debug in prod.
   * writeAsBreadcrumbs: Instead of having console.log statements we log messages to breadcrumbs
   * so you can investigate whats happening in production with your users to figure why things might not appear the
   * way you expect them to.
   *
   * You shouldn't care about this.
   *
   * Default: {
   *   writeAsBreadcrumbs: false;
   * }
   */
  debug: {
    writeAsBreadcrumbs: boolean;
  };

  routerTracing: RoutingInstrumentationClass;

  requestTracing: RequestInstrumentationClass;
} & RoutingInstrumentationOptions &
  RequestInstrumentationOptions;

export class BrowserTracing implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'BrowserTracing';

  /**
   * @inheritDoc
   */
  public name: string = BrowserTracing.id;

  /**
   * Browser Tracing integration options
   */
  public static options: BrowserTracingOptions;

  private readonly _emitOptionsWarning: boolean = false;

  /**
   * Returns current hub.
   */
  private static _getCurrentHub?: () => Hub;

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    Metrics.init();

    const defaults = {
      debug: {
        writeAsBreadcrumbs: false,
      },
      markBackgroundTransactions: true,
      maxTransactionDuration: 600,
      requestTracing: RequestTracing,
      routerTracing: RouterTracing,
    };

    // NOTE: Logger doesn't work in contructors, as it's initialized after integrations instances
    if (!_options || !Array.isArray(_options.tracingOrigins) || _options.tracingOrigins.length === 0) {
      this._emitOptionsWarning = true;
    }

    BrowserTracing.options = {
      ...defaultRoutingInstrumentationOptions,
      ...defaultRequestInstrumentionOptions,
      ...defaults,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    BrowserTracing._getCurrentHub = getCurrentHub;

    if (this._emitOptionsWarning) {
      logger.warn(
        '[Tracing] You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
      );
      logger.warn(
        `[Tracing] We added a reasonable default for you: ${defaultRequestInstrumentionOptions.tracingOrigins}`,
      );
    }

    const hub = getCurrentHub();

    // Track pageload/navigation transactions
    BrowserTracing._initRoutingInstrumentation(hub);
    // Track XHR and Fetch requests
    BrowserTracing._initRequestInstrumentation();
    // Set status of transactions on error
    registerErrorHandlers();
    // Finish transactions if document is no longer visible
    if (BrowserTracing.options.markBackgroundTransactions) {
      registerBackgroundTabDetection();
    }

    // This EventProcessor makes sure that the transaction is not longer than maxTransactionDuration
    addGlobalEventProcessor((event: Event) => {
      const self = getCurrentHub().getIntegration(BrowserTracing);
      if (!self) {
        return event;
      }

      const isOutdatedTransaction =
        event.timestamp &&
        event.start_timestamp &&
        (event.timestamp - event.start_timestamp > BrowserTracing.options.maxTransactionDuration ||
          event.timestamp - event.start_timestamp < 0);

      if (
        BrowserTracing.options.maxTransactionDuration !== 0 &&
        event.type === 'transaction' &&
        isOutdatedTransaction
      ) {
        BrowserTracing.log(`[Tracing] Transaction: ${SpanStatus.Cancelled} since it maxed out maxTransactionDuration`);
        if (event.contexts && event.contexts.trace) {
          event.contexts.trace = {
            ...event.contexts.trace,
            status: SpanStatus.DeadlineExceeded,
          };
          event.tags = {
            ...event.tags,
            maxTransactionDurationExceeded: 'true',
          };
        }
      }

      return event;
    });
  }

  /**
   * Initialize routing instrumentation
   */
  private static _initRoutingInstrumentation(hub: Hub): void {
    BrowserTracing.log('Set up Routing instrumentation');
    const {
      beforeNavigate,
      idleTimeout,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad,
    } = BrowserTracing.options;

    const routerTracing = new BrowserTracing.options.routerTracing({
      beforeNavigate,
      idleTimeout,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad,
    });

    const transactionContext = BrowserTracing._getTransactionContext();

    const beforeFinish = (transaction: IdleTransaction) => {
      Metrics.addPerformanceEntries(transaction);
    };

    routerTracing.init(hub, beforeFinish, transactionContext);
  }

  /**
   * Initialize request instrumentation
   */
  private static _initRequestInstrumentation(): void {
    const { shouldCreateSpanForRequest, traceFetch, traceXHR, tracingOrigins } = BrowserTracing.options;

    const requestTracing = new BrowserTracing.options.requestTracing({
      shouldCreateSpanForRequest,
      traceFetch,
      traceXHR,
      tracingOrigins,
    });

    requestTracing.init();
  }

  /**
   * Gets transaction context from a sentry-trace meta.
   */
  private static _getTransactionContext(): Partial<TransactionContext> {
    const header = getMeta('sentry-trace');
    if (header) {
      const span = SpanClass.fromTraceparent(header);
      if (span) {
        BrowserTracing.log(
          `[Tracing] found 'sentry-meta' '<meta />' continuing trace with: trace_id: ${span.traceId} span_id: ${
            span.parentSpanId
          }`,
        );

        return {
          parentSpanId: span.parentSpanId,
          sampled: span.sampled,
          traceId: span.traceId,
        };
      }
    }

    return {};
  }

  /**
   * Uses logger.log to log things in the SDK or as breadcrumbs if defined in options
   */
  public static log(...args: any[]): void {
    if (BrowserTracing.options && BrowserTracing.options.debug && BrowserTracing.options.debug.writeAsBreadcrumbs) {
      const _getCurrentHub = BrowserTracing._getCurrentHub;
      if (_getCurrentHub) {
        _getCurrentHub().addBreadcrumb({
          category: 'tracing',
          level: Severity.Debug,
          message: safeJoin(args, ' '),
          type: 'debug',
        });
      }
    }
    logger.log(...args);
  }
}

/**
 * Returns the value of a meta tag
 */
function getMeta(metaName: string): string | null {
  const el = document.querySelector(`meta[name=${metaName}]`);
  return el ? el.getAttribute('content') : null;
}
