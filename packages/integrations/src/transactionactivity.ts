import { EventProcessor, Hub, Integration, Scope, Span, SpanContext } from '@sentry/types';

/** JSDoc */
interface TransactionActivityOptions {
  // onLocationChange: (info) => {
  //   // info holds the location change api.
  //   // if this returns `null` there is no transaction started.
  //   return info.state.transaction || info.url;
  // },
  // onActivity?: (info) => {
  //   return info.type !== 'xhr' || !info.url.match(/zendesk/);
  // },
  idleTimeout?: number;
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
  public constructor(options?: TransactionActivityOptions) {
    TransactionActivity._options = {
      idleTimeout: 500,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    TransactionActivity._getCurrentHub = getCurrentHub;
  }

  /**
   * Internal run loop that checks if activy is running
   */
  private static _watchActivity(): void {
    const count = Object.keys(TransactionActivity._activities).length;
    if (count > 0) {
      clearTimeout(TransactionActivity._debounce);
      setTimeout(() => {
        TransactionActivity._watchActivity();
      }, 10);
    } else {
      TransactionActivity._debounce = (setTimeout(() => {
        const active = TransactionActivity._activeTransaction;
        if (active) {
          active.finish();
        }
      }, (TransactionActivity._options && TransactionActivity._options.idleTimeout) || 500) as any) as number; // TODO 500
    }
  }

  /**
   * Starts a Transaction waiting for activity idle to finish
   */
  public static startIdleTransaction(name: string, spanContext?: SpanContext): Span | undefined {
    const _getCurrentHub = TransactionActivity._getCurrentHub;
    if (!_getCurrentHub) {
      return undefined;
    }

    const hub = _getCurrentHub();
    if (!hub) {
      return undefined;
    }

    const span = hub.startSpan({
      ...spanContext,
      transaction: name,
    });

    TransactionActivity._activeTransaction = span;

    hub.configureScope((scope: Scope) => {
      scope.setSpan(span);
    });

    return span;
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

    TransactionActivity._watchActivity();
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
  }
}
