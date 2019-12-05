import { EventProcessor, Hub, Integration, Span, SpanContext, SpanStatus } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, isMatchingPattern, logger } from '@sentry/utils';

/**
 * Options for Tracing integration
 */
interface TracingOptions {
  /**
   * List of strings / regex where the integration should create Spans out of. Additionally this will be used
   * to define which outgoing requests the `sentry-trace` header will be attached to.
   *
   * Default: ['localhost', /^\//]
   */
  tracingOrigins: Array<string | RegExp>;
  /**
   * Flag to disable patching all together for fetch requests.
   *
   * Default: true
   */
  traceFetch: boolean;
  /**
   * Flag to disable patching all together for xhr requests.
   *
   * Default: true
   */
  traceXHR: boolean;
  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * By default it uses the `tracingOrigins` options as a url match.
   */
  shouldCreateSpanForRequest(url: string): boolean;
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   *
   * Default: 500
   */
  idleTimeout: number;
  /**
   * Flag to enable/disable creation of `navigation` transaction on history changes. Useful for react applications with
   * a router.
   *
   * Default: true
   */
  startTransactionOnLocationChange: boolean;
  /**
   * Sample to determine if the Integration should instrument anything. The decision will be taken once per load
   * on initalization.
   * 0 = 0% chance of instrumenting
   * 1 = 100% change of instrumenting
   *
   * Default: 1
   */
  tracesSampleRate: number;
}

/** JSDoc */
interface Activity {
  name: string;
  span?: Span;
}

const global = getGlobalObject<Window>();

/**
 * Tracing Integration
 */
export class Tracing implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Tracing.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Tracing';

  /**
   * Is Tracing enabled, this will be determined once per pageload.
   */
  private static _enabled?: boolean;

  /** JSDoc */
  public static options: TracingOptions;

  /**
   * Returns current hub.
   */
  private static _getCurrentHub?: () => Hub;

  private static _activeTransaction?: Span;

  private static _currentIndex: number = 0;

  public static readonly _activities: { [key: number]: Activity } = {};

  private static _debounce: number = 0;

  /**
   * Constructor for Tracing
   *
   * @param _options TracingOptions
   */
  public constructor(private readonly _options?: Partial<TracingOptions>) {
    const defaultTracingOrigins = ['localhost', /^\//];
    const defaults = {
      idleTimeout: 500,
      shouldCreateSpanForRequest(url: string): boolean {
        const origins = (_options && _options.tracingOrigins) || defaultTracingOrigins;
        return (
          origins.some((origin: string | RegExp) => isMatchingPattern(url, origin)) &&
          !isMatchingPattern(url, 'sentry_key')
        );
      },
      startTransactionOnLocationChange: true,
      traceFetch: true,
      traceXHR: true,
      tracesSampleRate: 1,
      tracingOrigins: defaultTracingOrigins,
    };
    if (!_options || !Array.isArray(_options.tracingOrigins) || _options.tracingOrigins.length === 0) {
      logger.warn(
        'Sentry: You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
      );
      logger.warn(`Sentry: We added a reasonable default for you: ${defaultTracingOrigins}`);
    }
    Tracing.options = this._options = {
      ...defaults,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    Tracing._getCurrentHub = getCurrentHub;

    if (!Tracing._isEnabled()) {
      return;
    }

    // tslint:disable-next-line: no-non-null-assertion
    if (this._options!.traceXHR !== false) {
      addInstrumentationHandler({
        callback: xhrCallback,
        type: 'xhr',
      });
    }
    // tslint:disable-next-line: no-non-null-assertion
    if (this._options!.traceFetch !== false) {
      addInstrumentationHandler({
        callback: fetchCallback,
        type: 'fetch',
      });
    }

    // tslint:disable-next-line: no-non-null-assertion
    if (this._options!.startTransactionOnLocationChange) {
      addInstrumentationHandler({
        callback: historyCallback,
        type: 'history',
      });
    }

    if (global.location && global.location.href) {
      // `${global.location.href}` will be used a temp transaction name
      Tracing.startIdleTransaction(global.location.href, {
        op: 'pageload',
        sampled: true,
      });
    }
  }

  /**
   * Is tracing enabled
   */
  private static _isEnabled(): boolean {
    if (Tracing._enabled !== undefined) {
      return Tracing._enabled;
    }
    // This happens only in test cases where the integration isn't initalized properly
    // tslint:disable-next-line: strict-type-predicates
    if (!Tracing.options || typeof Tracing.options.tracesSampleRate !== 'number') {
      return false;
    }
    Tracing._enabled = Math.random() > Tracing.options.tracesSampleRate ? false : true;
    return Tracing._enabled;
  }

  /**
   * Starts a Transaction waiting for activity idle to finish
   */
  public static startIdleTransaction(name: string, spanContext?: SpanContext): Span | undefined {
    if (!Tracing._isEnabled()) {
      // Tracing is not enabled
      return undefined;
    }

    // If we already have an active transaction it means one of two things
    // a) The user did rapid navigation changes and didn't wait until the transaction was finished
    // b) A activity wasn't popped correctly and therefore the transaction is stalling
    Tracing.finishIdleTransaction();

    const _getCurrentHub = Tracing._getCurrentHub;
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

    Tracing._activeTransaction = span;

    // We need to do this workaround here and not use configureScope
    // Reason being at the time we start the inital transaction we do not have a client bound on the hub yet
    // therefore configureScope wouldn't be executed and we would miss setting the transaction
    // tslint:disable-next-line: no-unsafe-any
    (hub as any).getScope().setSpan(span);

    // The reason we do this here is because of cached responses
    // If we start and transaction without an activity it would never finish since there is no activity
    const id = Tracing.pushActivity('idleTransactionStarted');
    setTimeout(() => {
      Tracing.popActivity(id);
    }, (Tracing.options && Tracing.options.idleTimeout) || 100);

    return span;
  }

  /**
   * Update transaction
   */
  public static updateTransactionName(name: string): void {
    const activeTransaction = Tracing._activeTransaction;
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
    const active = Tracing._activeTransaction;
    if (active) {
      // true = use timestamp of last span
      active.finish(true);
    }
  }

  /**
   * Sets the status of the current active transaction (if there is one)
   */
  public static setTransactionStatus(status: SpanStatus): void {
    const active = Tracing._activeTransaction;
    if (active) {
      active.setStatus(status);
    }
  }

  /**
   * Starts tracking for a specifc activity
   */
  public static pushActivity(name: string, spanContext?: SpanContext): number {
    if (!Tracing._isEnabled()) {
      // Tracing is not enabled
      return 0;
    }

    // We want to clear the timeout also here since we push a new activity
    clearTimeout(Tracing._debounce);

    const _getCurrentHub = Tracing._getCurrentHub;
    if (spanContext && _getCurrentHub) {
      const hub = _getCurrentHub();
      if (hub) {
        Tracing._activities[Tracing._currentIndex] = {
          name,
          span: hub.startSpan(spanContext),
        };
      }
    } else {
      Tracing._activities[Tracing._currentIndex] = {
        name,
      };
    }

    return Tracing._currentIndex++;
  }

  /**
   * Removes activity and finishes the span in case there is one
   */
  public static popActivity(id: number, spanData?: { [key: string]: any }): void {
    if (!Tracing._isEnabled()) {
      // Tracing is not enabled
      return;
    }

    const activity = Tracing._activities[id];
    if (activity) {
      const span = activity.span;
      if (span) {
        if (spanData) {
          Object.keys(spanData).forEach((key: string) => {
            span.setData(key, spanData[key]);
            if (key === 'status_code') {
              span.setHttpStatus(spanData[key] as number);
            }
          });
        }
        span.finish();
      }
      // tslint:disable-next-line: no-dynamic-delete
      delete Tracing._activities[id];
    }

    const count = Object.keys(Tracing._activities).length;
    clearTimeout(Tracing._debounce);

    if (count === 0) {
      const timeout = Tracing.options && Tracing.options.idleTimeout;
      Tracing._debounce = (setTimeout(() => {
        Tracing.finishIdleTransaction();
      }, timeout) as any) as number;
    }
  }
}

/**
 * Creates breadcrumbs from XHR API calls
 */
function xhrCallback(handlerData: { [key: string]: any }): void {
  if (!Tracing.options.traceXHR) {
    return;
  }

  // tslint:disable-next-line: no-unsafe-any
  if (!handlerData || !handlerData.xhr || !handlerData.xhr.__sentry_xhr__) {
    return;
  }

  // tslint:disable: no-unsafe-any
  const xhr = handlerData.xhr.__sentry_xhr__;

  if (!Tracing.options.shouldCreateSpanForRequest(xhr.url)) {
    return;
  }

  // We only capture complete, non-sentry requests
  if (handlerData.xhr.__sentry_own_request__) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.xhr.__sentry_xhr_activity_id__) {
    Tracing.popActivity(handlerData.xhr.__sentry_xhr_activity_id__, handlerData.xhr.__sentry_xhr__);
    return;
  }

  handlerData.xhr.__sentry_xhr_activity_id__ = Tracing.pushActivity('xhr', {
    data: {
      ...xhr.data,
      type: 'xhr',
    },
    description: `${xhr.method} ${xhr.url}`,
    op: 'http',
  });

  // Adding the trace header to the span
  const activity = Tracing._activities[handlerData.xhr.__sentry_xhr_activity_id__];
  if (activity) {
    const span = activity.span;
    if (span && handlerData.xhr.setRequestHeader) {
      handlerData.xhr.setRequestHeader('sentry-trace', span.toTraceparent());
    }
  }
  // tslint:enable: no-unsafe-any
}

/**
 * Creates breadcrumbs from fetch API calls
 */
function fetchCallback(handlerData: { [key: string]: any }): void {
  // tslint:disable: no-unsafe-any
  if (!Tracing.options.traceFetch) {
    return;
  }

  if (!Tracing.options.shouldCreateSpanForRequest(handlerData.fetchData.url)) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.fetchData.__activity) {
    Tracing.popActivity(handlerData.fetchData.__activity, handlerData.fetchData);
  } else {
    handlerData.fetchData.__activity = Tracing.pushActivity('fetch', {
      data: {
        ...handlerData.fetchData,
        type: 'fetch',
      },
      description: `${handlerData.fetchData.method} ${handlerData.fetchData.url}`,
      op: 'http',
    });

    const activity = Tracing._activities[handlerData.fetchData.__activity];
    if (activity) {
      const span = activity.span;
      if (span) {
        const options = (handlerData.args[1] = (handlerData.args[1] as { [key: string]: any }) || {});
        if (options.headers) {
          if (Array.isArray(options.headers)) {
            options.headers = [...options.headers, { 'sentry-trace': span.toTraceparent() }];
          } else {
            options.headers = {
              ...options.headers,
              'sentry-trace': span.toTraceparent(),
            };
          }
        } else {
          options.headers = { 'sentry-trace': span.toTraceparent() };
        }
      }
    }
  }
  // tslint:enable: no-unsafe-any
}

/**
 * Creates transaction from navigation changes
 */
function historyCallback(_: { [key: string]: any }): void {
  if (Tracing.options.startTransactionOnLocationChange && global && global.location) {
    Tracing.startIdleTransaction(global.location.href, {
      op: 'navigation',
      sampled: true,
    });
  }
}
