import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, Severity, TransactionContext } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, logger, safeJoin } from '@sentry/utils';

import { startIdleTransaction } from '../hubextensions';
import { DEFAULT_IDLE_TIMEOUT, IdleTransaction } from '../idletransaction';
import { Span } from '../span';
import { Location as LocationType } from '../types';

const global = getGlobalObject<Window>();

type routingInstrumentationProcessor = (context: TransactionContext) => TransactionContext;

/**
 * Gets transaction context from a sentry-trace meta.
 */
const setHeaderContext: routingInstrumentationProcessor = ctx => {
  const header = getMetaContent('sentry-trace');
  if (header) {
    const span = Span.fromTraceparent(header);
    if (span) {
      return {
        ...ctx,
        parentSpanId: span.parentSpanId,
        sampled: span.sampled,
        traceId: span.traceId,
      };
    }
  }

  return ctx;
};

/** Options for Browser Tracing integration */
export interface BrowserTracingOptions {
  /**
   * This is only if you want to debug in prod.
   * writeAsBreadcrumbs: Instead of having console.log statements we log messages to breadcrumbs
   * so you can investigate whats happening in production with your users to figure why things might not appear the
   * way you expect them to.
   *
   * Default: {
   *   writeAsBreadcrumbs: false;
   * }
   */
  debug: {
    writeAsBreadcrumbs: boolean;
  };

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
  beforeNavigate(location: LocationType): string | undefined;

  /**
   * Set to adjust transaction context before creation of transaction. Useful to set name/data/tags before
   * a transaction is sent. This option should be used by routing libraries to set context on transactions.
   */
  // TODO: Should this be an option, or a static class variable and passed
  // in and we use something like `BrowserTracing.addRoutingProcessor()`
  routingInstrumentationProcessors: routingInstrumentationProcessor[];

  /**
   * Flag to enable default routing instrumentation.
   *
   * Default: true
   */
  defaultRoutingInstrumentation: boolean;
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
  public static options: BrowserTracingOptions;

  /**
   * @inheritDoc
   */
  public name: string = BrowserTracing.id;

  private static _activeTransaction?: IdleTransaction;

  private static _getCurrentHub?: () => Hub;

  public constructor(_options?: Partial<BrowserTracingOptions>) {
    const defaults: BrowserTracingOptions = {
      beforeNavigate(location: LocationType): string | undefined {
        return location.pathname;
      },
      debug: {
        writeAsBreadcrumbs: false,
      },
      defaultRoutingInstrumentation: true,
      idleTimeout: DEFAULT_IDLE_TIMEOUT,
      routingInstrumentationProcessors: [],
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
    };
    BrowserTracing.options = {
      ...defaults,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    BrowserTracing._getCurrentHub = getCurrentHub;

    if (!global || !global.location) {
      return;
    }

    // TODO: is it fine that this is mutable operation? Could also do = [...routingInstr, setHeaderContext]?
    BrowserTracing.options.routingInstrumentationProcessors.push(setHeaderContext);
    if (BrowserTracing.options.defaultRoutingInstrumentation) {
      BrowserTracing._initRoutingInstrumentation();
    }
  }

  /** Start routing instrumentation */
  private static _initRoutingInstrumentation(): void {
    const { startTransactionOnPageLoad, startTransactionOnLocationChange } = BrowserTracing.options;

    if (startTransactionOnPageLoad) {
      BrowserTracing._activeTransaction = BrowserTracing.createRouteTransaction('pageload');
    }

    let startingUrl: string | undefined = global.location.href;

    addInstrumentationHandler({
      callback: ({ to, from }: { to: string; from?: string }) => {
        /**
         * This early return is there to account for some cases where navigation transaction
         * starts right after long running pageload. We make sure that if from is undefined
         * and that a valid startingURL exists, we don't uncessarily create a navigation transaction.
         *
         * This was hard to duplicate, but this behaviour stopped as soon as this fix
         * was applied. This issue might also only be caused in certain development environments
         * where the usage of a hot module reloader is causing errors.
         */
        if (from === undefined && startingUrl && startingUrl.indexOf(to) !== -1) {
          startingUrl = undefined;
          return;
        }
        if (startTransactionOnLocationChange && from !== to) {
          startingUrl = undefined;
          if (BrowserTracing._activeTransaction) {
            // We want to finish all current ongoing idle transactions as we
            // are navigating to a new page.
            BrowserTracing._activeTransaction.finishIdleTransaction();
          }
          BrowserTracing._activeTransaction = BrowserTracing.createRouteTransaction('navigation');
        }
      },
      type: 'history',
    });
  }

  /** Create pageload/navigation idle transaction. */
  public static createRouteTransaction(
    op: 'pageload' | 'navigation',
    ctx?: TransactionContext,
  ): IdleTransaction | undefined {
    if (!BrowserTracing._getCurrentHub) {
      return undefined;
    }

    const { beforeNavigate, idleTimeout, routingInstrumentationProcessors } = BrowserTracing.options;

    // if beforeNavigate returns undefined, we should not start a transaction.
    const name = beforeNavigate(global.location);
    if (name === undefined) {
      return undefined;
    }

    let context: TransactionContext = { name, op, ...ctx };
    if (routingInstrumentationProcessors) {
      for (const processor of routingInstrumentationProcessors) {
        context = processor(context);
      }
    }

    const hub = BrowserTracing._getCurrentHub();
    BrowserTracing._log(`[Tracing] starting ${op} idleTransaction on scope with context:`, context);
    const activeTransaction = startIdleTransaction(hub, context, idleTimeout, true);

    return activeTransaction;
  }

  /**
   * Uses logger.log to log things in the SDK or as breadcrumbs if defined in options
   */
  private static _log(...args: any[]): void {
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
export function getMetaContent(metaName: string): string | null {
  const el = document.querySelector(`meta[name=${metaName}]`);
  return el ? el.getAttribute('content') : null;
}
