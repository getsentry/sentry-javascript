import { EventProcessor, Integration, Span, SpanContext } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

import { Hub, makeApmHubMain } from '../hub';

/** JSDoc */
interface TransactionActivityOptions {
  idleTimeout: number;
  startTransactionOnLocationChange: boolean;
  tracesSampleRate: number;
}

/** JSDoc */
interface Activity {
  name: string;
  span?: Span;
}

const global = getGlobalObject<Window>();

/** JSDoc */
export class TransactionActivity implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = TransactionActivity.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'TransactionActivity';

  /**
   * Is Tracing enabled, this will be determined once per pageload.
   */
  private static _enabled?: boolean;

  /** JSDoc */
  public static options: TransactionActivityOptions;

  /**
   * Returns current hub.
   */
  private static _getCurrentHub?: () => Hub;

  private static _activeTransaction?: Span;

  private static _currentIndex: number = 0;

  private static readonly _activities: { [key: number]: Activity } = {};

  private static _debounce: number = 0;

  /**
   * @inheritDoc
   */
  public constructor(public readonly _options?: Partial<TransactionActivityOptions>) {
    makeApmHubMain();
    const defaults = {
      idleTimeout: 500,
      startTransactionOnLocationChange: true,
      tracesSampleRate: 1,
    };
    TransactionActivity.options = {
      ...defaults,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    TransactionActivity._getCurrentHub = getCurrentHub;
    if (!TransactionActivity._isEnabled()) {
      return;
    }
    if (global.location && global.location.href) {
      // `${global.location.href}` will be used a temp transaction name
      TransactionActivity.startIdleTransaction(global.location.href, {
        op: 'pageload',
        sampled: true,
      });
    }
  }

  /**
   * Is tracing enabled
   */
  private static _isEnabled(): boolean {
    if (TransactionActivity._enabled !== undefined) {
      return TransactionActivity._enabled;
    }
    // This happens only in test cases where the integration isn't initalized properly
    // tslint:disable-next-line: strict-type-predicates
    if (!TransactionActivity.options || typeof TransactionActivity.options.tracesSampleRate !== 'number') {
      return false;
    }
    TransactionActivity._enabled = Math.random() > TransactionActivity.options.tracesSampleRate ? false : true;
    return TransactionActivity._enabled;
  }

  /**
   * Starts a Transaction waiting for activity idle to finish
   */
  public static startIdleTransaction(name: string, spanContext?: SpanContext): Span | undefined {
    if (!TransactionActivity._isEnabled()) {
      // Tracing is not enabled
      return undefined;
    }

    const activeTransaction = TransactionActivity._activeTransaction;

    if (activeTransaction) {
      // If we already have an active transaction it means one of two things
      // a) The user did rapid navigation changes and didn't wait until the transaction was finished
      // b) A activity wasn't popped correctly and therefore the transaction is stalling
      activeTransaction.finish();
    }

    const _getCurrentHub = TransactionActivity._getCurrentHub;
    if (!_getCurrentHub) {
      return undefined;
    }

    const hub = _getCurrentHub();
    if (!hub) {
      return undefined;
    }

    const span = hub.startSpan(
      {
        ...spanContext,
        transaction: name,
      },
      true,
    );

    TransactionActivity._activeTransaction = span;

    // We need to do this workaround here and not use configureScope
    // Reason being at the time we start the inital transaction we do not have a client bound on the hub yet
    // therefore configureScope wouldn't be executed and we would miss setting the transaction
    // tslint:disable-next-line: no-unsafe-any
    (hub as any).getScope().setSpan(span);

    // The reason we do this here is because of cached responses
    // If we start and transaction without an activity it would never finish since there is no activity
    const id = TransactionActivity.pushActivity('idleTransactionStarted');
    setTimeout(() => {
      TransactionActivity.popActivity(id);
    }, (TransactionActivity.options && TransactionActivity.options.idleTimeout) || 100);

    return span;
  }

  /**
   * Update transaction
   */
  public static updateTransactionName(name: string): void {
    const activeTransaction = TransactionActivity._activeTransaction;
    if (!activeTransaction) {
      return;
    }
    // TODO
    (activeTransaction as any).transaction = name;
  }

  /**
   * Finshes the current active transaction
   */
  public static finishIdleTransaction(): void {
    const active = TransactionActivity._activeTransaction;
    if (active) {
      // true = use timestamp of last span
      active.finish(true);
    }
  }

  /**
   * Starts tracking for a specifc activity
   */
  public static pushActivity(name: string, spanContext?: SpanContext): number {
    if (!TransactionActivity._isEnabled()) {
      // Tracing is not enabled
      return 0;
    }

    // We want to clear the timeout also here since we push a new activity
    clearTimeout(TransactionActivity._debounce);

    const _getCurrentHub = TransactionActivity._getCurrentHub;
    if (spanContext && _getCurrentHub) {
      const hub = _getCurrentHub();
      if (hub) {
        TransactionActivity._activities[TransactionActivity._currentIndex] = {
          name,
          span: hub.startSpan(spanContext),
        };
      }
    } else {
      TransactionActivity._activities[TransactionActivity._currentIndex] = {
        name,
      };
    }

    return TransactionActivity._currentIndex++;
  }

  /**
   * Removes activity and finishes the span in case there is one
   */
  public static popActivity(id: number, spanData?: { [key: string]: any }): void {
    if (!TransactionActivity._isEnabled()) {
      // Tracing is not enabled
      return;
    }

    const activity = TransactionActivity._activities[id];
    if (activity) {
      const span = activity.span;
      if (span) {
        if (spanData) {
          Object.keys(spanData).forEach((key: string) => {
            span.setData(key, spanData[key]);
          });
        }
        span.finish();
      }
      // tslint:disable-next-line: no-dynamic-delete
      delete TransactionActivity._activities[id];
    }

    const count = Object.keys(TransactionActivity._activities).length;
    clearTimeout(TransactionActivity._debounce);

    if (count === 0) {
      const timeout = TransactionActivity.options && TransactionActivity.options.idleTimeout;
      TransactionActivity._debounce = (setTimeout(() => {
        TransactionActivity.finishIdleTransaction();
      }, timeout) as any) as number;
    }
  }
}

/**
 * Creates breadcrumbs from XHR API calls
 */
function xhrCallback(handlerData: { [key: string]: any }): void {
  // tslint:disable: no-unsafe-any
  if (handlerData.requestComplete && handlerData.xhr.__sentry_xhr_activity_id__) {
    TransactionActivity.popActivity(handlerData.xhr.__sentry_xhr_activity_id__, handlerData.xhr.__sentry_xhr__);
    return;
  }
  // We only capture complete, non-sentry requests
  if (handlerData.xhr.__sentry_own_request__) {
    return;
  }

  const xhr = handlerData.xhr.__sentry_xhr__;
  handlerData.xhr.__sentry_xhr_activity_id__ = TransactionActivity.pushActivity('xhr', {
    data: {
      request_data: xhr.data,
    },
    description: `${xhr.method} ${xhr.url}`,
    op: 'http',
  });
  // tslint:enable: no-unsafe-any
}

/**
 * Creates breadcrumbs from fetch API calls
 */
// function fetchHandler(handlerData: { [key: string]: any }): void {
//   // We only capture complete fetch requests
//   if (!handlerData.requestComplete) {
//     return;
//   }

// const client = getCurrentHub().getClient<BrowserClient>();
// const dsn = client && client.getDsn();

// if (dsn) {
//   const filterUrl = new API(dsn).getStoreEndpoint();
//   // if Sentry key appears in URL, don't capture it as a request
//   // but rather as our own 'sentry' type breadcrumb
//   if (
//     filterUrl &&
//     handlerData.fetchData.url.indexOf(filterUrl) !== -1 &&
//     handlerData.fetchData.method === 'POST' &&
//     handlerData.args[1] &&
//     handlerData.args[1].body
//   ) {
//     addSentryBreadcrumb(handlerData.args[1].body);
//     return;
//   }
// }

// if (handlerData.error) {
//   getCurrentHub().addBreadcrumb(
//     {
//       category: 'fetch',
//       data: handlerData.fetchData,
//       level: Severity.Error,
//       type: 'http',
//     },
//     {
//       data: handlerData.error,
//       input: handlerData.args,
//     },
//   );
// } else {
//   getCurrentHub().addBreadcrumb(
//     {
//       category: 'fetch',
//       data: handlerData.fetchData,
//       type: 'http',
//     },
//     {
//       input: handlerData.args,
//       response: handlerData.response,
//     },
//   );
// }
// }

/**
 * Creates transaction from navigation changes
 */
function historyCallback(_: { [key: string]: any }): void {
  if (TransactionActivity.options.startTransactionOnLocationChange) {
    TransactionActivity.startIdleTransaction(global.location.href, {
      op: 'navigation',
      sampled: true,
    });
  }
}

const historyHandler = {
  callback: historyCallback,
  type: 'history',
};

const xhrHandler = {
  callback: xhrCallback,
  type: 'xhr',
};

// tslint:disable-next-line: variable-name
export const TransactionActivityHandlers = [historyHandler, xhrHandler];
