import { EventProcessor, Hub, Integration, Scope, Span, SpanContext } from '@sentry/types';

/** JSDoc */
interface TransactionActivityOptions {
  idleTimeout: number;
  patchHistory: boolean;
  /**
   * Called when an history change happend
   */
  onLocationChange(state: any): string;
  startTransactionOnLocationChange: boolean;
}

/** JSDoc */
interface Activity {
  name: string;
  span?: Span;
}

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

  /** JSDoc */
  private static _options: TransactionActivityOptions;

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
  public constructor(
    public readonly _options: TransactionActivityOptions = {
      idleTimeout: 500,
      onLocationChange: () => window.location.href,
      patchHistory: true,
      startTransactionOnLocationChange: true,
    },
  ) {
    TransactionActivity._options = _options;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    TransactionActivity._getCurrentHub = getCurrentHub;
    if (this._options.patchHistory) {
      // tslint:disable: no-unsafe-any
      // tslint:disable-next-line: typedef only-arrow-functions
      (function(history: any) {
        const pushState = history.pushState;
        // tslint:disable-next-line: typedef only-arrow-functions
        history.pushState = function(state: any) {
          if (typeof history.onpushstate === 'function') {
            history.onpushstate({ state });
          }
          // ... whatever else you want to do
          // maybe call onhashchange e.handler
          return pushState.apply(history, arguments);
        };
      })(window.history);
      window.onpopstate = (history as any).onpushstate = (_state: any) => {
        if (this._options.startTransactionOnLocationChange) {
          TransactionActivity.startIdleTransaction(`${window.location.href}`, {
            op: 'navigation',
            sampled: true,
          });
        }
      };
      // tslint:enable: no-unsafe-any
    }
  }

  /**
   * Starts a Transaction waiting for activity idle to finish
   */
  public static startIdleTransaction(name: string, spanContext?: SpanContext): Span | undefined {
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

    hub.configureScope((scope: Scope) => {
      scope.setSpan(span);
    });

    // The reason we do this here is because of cached responses
    // If we start and transaction without an activity it would never finish since there is no activity
    const id = TransactionActivity.pushActivity('idleTransactionStarted');
    setTimeout(() => {
      TransactionActivity.popActivity(id);
    }, (TransactionActivity._options && TransactionActivity._options.idleTimeout) || 100);

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
  public static popActivity(id: number): void {
    const activity = TransactionActivity._activities[id];
    if (activity) {
      if (activity.span) {
        activity.span.finish();
      }
      // tslint:disable-next-line: no-dynamic-delete
      delete TransactionActivity._activities[id];
    }

    const count = Object.keys(TransactionActivity._activities).length;
    clearTimeout(TransactionActivity._debounce);

    if (count === 0) {
      const timeout = TransactionActivity._options && TransactionActivity._options.idleTimeout;
      TransactionActivity._debounce = (setTimeout(() => {
        TransactionActivity.finishIdleTransaction();
      }, timeout) as any) as number;
    }
  }
}
