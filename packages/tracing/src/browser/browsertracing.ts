import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, Transaction as TransactionType, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { startIdleTransaction } from '../hubextensions';
import { DEFAULT_IDLE_TIMEOUT } from '../idletransaction';
import { Span } from '../span';

import { defaultBeforeNavigate, defaultRoutingInstrumentation } from './router';

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions {
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
   * beforeNavigate is called before a pageload/navigation transaction is created and allows for users
   * to set a custom navigation transaction name. Defaults behaviour is to return `window.location.pathname`.
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
    routingInstrumentation: defaultRoutingInstrumentation,
    startTransactionOnLocationChange: true,
    startTransactionOnPageLoad: true,
  };

  /**
   * @inheritDoc
   */
  public name: string = BrowserTracing.id;

  private _getCurrentHub?: () => Hub;

  // navigationTransactionInvoker() -> Uses history API NavigationTransaction[]

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    this.options = {
      ...this.options,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._getCurrentHub = getCurrentHub;

    const { routingInstrumentation, startTransactionOnLocationChange, startTransactionOnPageLoad } = this.options;

    routingInstrumentation(
      (context: TransactionContext) => this._createRouteTransaction(context),
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
    );
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(context: TransactionContext): TransactionType | undefined {
    if (!this._getCurrentHub) {
      logger.warn(`[Tracing] Did not creeate ${context.op} idleTransaction due to invalid _getCurrentHub`);
      return undefined;
    }

    const { beforeNavigate, idleTimeout } = this.options;

    // if beforeNavigate returns undefined, we should not start a transaction.
    const ctx = beforeNavigate({
      ...context,
      ...getHeaderContext(),
    });

    if (ctx === undefined) {
      logger.log(`[Tracing] Did not create ${context.op} idleTransaction due to beforeNavigate`);
      return undefined;
    }

    const hub = this._getCurrentHub();
    logger.log(`[Tracing] starting ${ctx.op} idleTransaction on scope with context:`, ctx);
    return startIdleTransaction(hub, ctx, idleTimeout, true) as TransactionType;
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
