import { EventProcessor, Hub, Integration, Span, SpanContext } from '@sentry/types';
import { fill, getGlobalObject, isMatchingPattern, logger, supportsNativeFetch } from '@sentry/utils';

/** JSDoc */
interface TracingOptions {
  tracingOrigins: Array<string | RegExp>;
  traceFetch: boolean;
  traceXHR: boolean;
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
   * If we have an xhr we need to store the url in the instance.
   *
   */
  // @ts-ignore
  private _xhrUrl?: string;

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

  private static readonly _activities: { [key: number]: Activity } = {};

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
      this._traceXHR(getCurrentHub);
    }
    // tslint:disable-next-line: no-non-null-assertion
    if (this._options!.traceFetch !== false) {
      this._traceFetch(getCurrentHub);
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
   * JSDoc
   */
  private _traceXHR(getCurrentHub: () => Hub): void {
    if (!('XMLHttpRequest' in getGlobalObject<Window>())) {
      return;
    }

    const xhrproto = XMLHttpRequest.prototype;

    fill(
      xhrproto,
      'open',
      originalOpen =>
        function(this: XMLHttpRequest, ...args: any[]): void {
          // @ts-ignore
          const self = getCurrentHub().getIntegration(Tracing);
          if (self) {
            self._xhrUrl = args[1] as string;
          }
          // tslint:disable-next-line: no-unsafe-any
          return originalOpen.apply(this, args);
        },
    );

    fill(
      xhrproto,
      'send',
      originalSend =>
        function(this: XMLHttpRequest, ...args: any[]): void {
          // @ts-ignore
          const self = getCurrentHub().getIntegration(Tracing);
          // tslint:disable-next-line: no-non-null-assertion
          if (self && self._xhrUrl && self._options!.tracingOrigins) {
            const url = self._xhrUrl;
            const headers = getCurrentHub().traceHeaders();
            // tslint:disable-next-line: prefer-for-of no-non-null-assertion
            let isWhitelisted = self._options!.tracingOrigins.some((origin: string | RegExp) =>
              isMatchingPattern(url, origin),
            );

            if (isMatchingPattern(url, 'sentry_key')) {
              // If sentry_key is in the url, it's an internal store request to sentry
              // we do not want to add the trace header to store requests
              isWhitelisted = false;
            }

            if (isWhitelisted && this.setRequestHeader) {
              Object.keys(headers).forEach(key => {
                this.setRequestHeader(key, headers[key]);
              });
            }
          }
          // tslint:disable-next-line: no-unsafe-any
          return originalSend.apply(this, args);
        },
    );
  }

  /**
   * JSDoc
   */
  private _traceFetch(getCurrentHub: () => Hub): void {
    if (!supportsNativeFetch()) {
      return;
    }

    // tslint:disable: only-arrow-functions
    fill(getGlobalObject<Window>(), 'fetch', function(originalFetch: () => void): () => void {
      return function(...args: any[]): void {
        // @ts-ignore
        const hub = getCurrentHub();
        const self = hub.getIntegration(Tracing);
        // tslint:disable-next-line: no-non-null-assertion
        if (self && self._options!.tracingOrigins) {
          const url = args[0] as string;
          const options = (args[1] = (args[1] as { [key: string]: any }) || {});

          let isWhitelisted = false;
          // tslint:disable-next-line: no-non-null-assertion
          self._options!.tracingOrigins.forEach((whiteListUrl: string | RegExp) => {
            if (!isWhitelisted) {
              isWhitelisted = isMatchingPattern(url, whiteListUrl);
            }
          });

          if (isMatchingPattern(url, 'sentry_key')) {
            // If sentry_key is in the url, it's an internal store request to sentry
            // we do not want to add the trace header to store requests
            isWhitelisted = false;
          }

          if (isWhitelisted) {
            if (options.headers) {
              if (Array.isArray(options.headers)) {
                options.headers = [...options.headers, ...Object.entries(hub.traceHeaders())];
              } else {
                options.headers = {
                  ...options.headers,
                  ...hub.traceHeaders(),
                };
              }
            } else {
              options.headers = hub.traceHeaders();
            }
          }
        }
        // tslint:disable-next-line: no-unsafe-any
        return originalFetch.apply(getGlobalObject<Window>(), args);
      };
    });
    // tslint:enable: only-arrow-functions
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

    const activeTransaction = Tracing._activeTransaction;

    if (activeTransaction) {
      // If we already have an active transaction it means one of two things
      // a) The user did rapid navigation changes and didn't wait until the transaction was finished
      // b) A activity wasn't popped correctly and therefore the transaction is stalling
      activeTransaction.finish();
    }

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
  // tslint:disable: no-unsafe-any
  if (handlerData.requestComplete && handlerData.xhr.__sentry_xhr_activity_id__) {
    Tracing.popActivity(handlerData.xhr.__sentry_xhr_activity_id__, handlerData.xhr.__sentry_xhr__);
    return;
  }
  // We only capture complete, non-sentry requests
  if (handlerData.xhr.__sentry_own_request__) {
    return;
  }

  const xhr = handlerData.xhr.__sentry_xhr__;
  handlerData.xhr.__sentry_xhr_activity_id__ = Tracing.pushActivity('xhr', {
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
  if (Tracing.options.startTransactionOnLocationChange && global && global.location) {
    Tracing.startIdleTransaction(global.location.href, {
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
export const TracingHandlers = [historyHandler, xhrHandler];
