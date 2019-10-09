import { API, getCurrentHub } from '@sentry/core';
import { Breadcrumb, BreadcrumbHint, Integration, Severity, WrappedFunction } from '@sentry/types';
import {
  fill,
  getEventDescription,
  getGlobalObject,
  isString,
  logger,
  normalize,
  parseUrl,
  safeJoin,
  supportsHistory,
  supportsNativeFetch,
} from '@sentry/utils';

import { BrowserClient } from '../client';
import { breadcrumbEventHandler, keypressEventHandler, wrap } from '../helpers';

const global = getGlobalObject<Window>();
let lastHref: string | undefined;
/**
 * @hidden
 */
export interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
  };
}

/** JSDoc */
interface BreadcrumbIntegrations {
  console?: boolean;
  dom?: boolean;
  fetch?: boolean;
  history?: boolean;
  sentry?: boolean;
  xhr?: boolean;
}

type XMLHttpRequestProp = 'onload' | 'onerror' | 'onprogress';

/** Default Breadcrumbs instrumentations */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Breadcrumbs.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Breadcrumbs';

  /** JSDoc */
  private readonly _options: BreadcrumbIntegrations;

  /**
   * @inheritDoc
   */
  public constructor(options?: BreadcrumbIntegrations) {
    this._options = {
      console: true,
      dom: true,
      fetch: true,
      history: true,
      sentry: true,
      xhr: true,
      ...options,
    };
  }

  /** JSDoc */
  private _instrumentConsole(): void {
    if (!('console' in global)) {
      return;
    }
    ['debug', 'info', 'warn', 'error', 'log', 'assert'].forEach(function(level: string): void {
      if (!(level in global.console)) {
        return;
      }

      fill(global.console, level, function(originalConsoleLevel: () => any): Function {
        return function(...args: any[]): void {
          const breadcrumbData = {
            category: 'console',
            data: {
              extra: {
                arguments: normalize(args, 3),
              },
              logger: 'console',
            },
            level: Severity.fromString(level),
            message: safeJoin(args, ' '),
          };

          if (level === 'assert') {
            if (args[0] === false) {
              breadcrumbData.message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
              breadcrumbData.data.extra.arguments = normalize(args.slice(1), 3);
              Breadcrumbs.addBreadcrumb(breadcrumbData, {
                input: args,
                level,
              });
            }
          } else {
            Breadcrumbs.addBreadcrumb(breadcrumbData, {
              input: args,
              level,
            });
          }

          // this fails for some browsers. :(
          if (originalConsoleLevel) {
            Function.prototype.apply.call(originalConsoleLevel, global.console, args);
          }
        };
      });
    });
  }

  /** JSDoc */
  private _instrumentDOM(): void {
    if (!('document' in global)) {
      return;
    }

    // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
    // to the document. Do this before we instrument addEventListener.
    global.document.addEventListener('click', breadcrumbEventHandler('click'), false);
    global.document.addEventListener('keypress', keypressEventHandler(), false);

    // After hooking into document bubbled up click and keypresses events, we also hook into user handled click & keypresses.
    ['EventTarget', 'Node'].forEach((target: string) => {
      const proto = (global as any)[target] && (global as any)[target].prototype;

      if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
        return;
      }

      fill(proto, 'addEventListener', function(
        original: () => void,
      ): (
        eventName: string,
        fn: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => void {
        return function(
          this: any,
          eventName: string,
          fn: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions,
        ): (eventName: string, fn: EventListenerOrEventListenerObject, capture?: boolean, secure?: boolean) => void {
          if (fn && (fn as EventListenerObject).handleEvent) {
            if (eventName === 'click') {
              fill(fn, 'handleEvent', function(innerOriginal: () => void): (caughtEvent: Event) => void {
                return function(this: any, event: Event): (event: Event) => void {
                  breadcrumbEventHandler('click')(event);
                  return innerOriginal.call(this, event);
                };
              });
            }
            if (eventName === 'keypress') {
              fill(fn, 'handleEvent', function(innerOriginal: () => void): (caughtEvent: Event) => void {
                return function(this: any, event: Event): (event: Event) => void {
                  keypressEventHandler()(event);
                  return innerOriginal.call(this, event);
                };
              });
            }
          } else {
            if (eventName === 'click') {
              breadcrumbEventHandler('click', true)(this);
            }
            if (eventName === 'keypress') {
              keypressEventHandler()(this);
            }
          }

          return original.call(this, eventName, fn, options);
        };
      });

      fill(proto, 'removeEventListener', function(
        original: () => void,
      ): (
        this: any,
        eventName: string,
        fn: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) => () => void {
        return function(
          this: any,
          eventName: string,
          fn: EventListenerOrEventListenerObject,
          options?: boolean | EventListenerOptions,
        ): () => void {
          let callback = fn as WrappedFunction;
          try {
            callback = callback && (callback.__sentry_wrapped__ || callback);
          } catch (e) {
            // ignore, accessing __sentry_wrapped__ will throw in some Selenium environments
          }
          return original.call(this, eventName, callback, options);
        };
      });
    });
  }

  /** JSDoc */
  private _instrumentFetch(): void {
    if (!supportsNativeFetch()) {
      return;
    }

    fill(global, 'fetch', function(originalFetch: () => void): () => void {
      return function(...args: any[]): void {
        const fetchInput = args[0];
        let method = 'GET';
        let url;

        if (typeof fetchInput === 'string') {
          url = fetchInput;
        } else if ('Request' in global && fetchInput instanceof Request) {
          url = fetchInput.url;
          if (fetchInput.method) {
            method = fetchInput.method;
          }
        } else {
          url = String(fetchInput);
        }

        if (args[1] && args[1].method) {
          method = args[1].method;
        }

        const client = getCurrentHub().getClient<BrowserClient>();
        const dsn = client && client.getDsn();
        if (dsn) {
          const filterUrl = new API(dsn).getStoreEndpoint();
          // if Sentry key appears in URL, don't capture it as a request
          // but rather as our own 'sentry' type breadcrumb
          if (filterUrl && url.indexOf(filterUrl) !== -1) {
            if (method === 'POST' && args[1] && args[1].body) {
              addSentryBreadcrumb(args[1].body);
            }
            return originalFetch.apply(global, args);
          }
        }

        const fetchData: {
          method: string;
          url: string;
          status_code?: number;
        } = {
          method: isString(method) ? method.toUpperCase() : method,
          url,
        };

        return originalFetch
          .apply(global, args)
          .then((response: Response) => {
            fetchData.status_code = response.status;
            Breadcrumbs.addBreadcrumb(
              {
                category: 'fetch',
                data: fetchData,
                type: 'http',
              },
              {
                input: args,
                response,
              },
            );
            return response;
          })
          .catch((error: Error) => {
            Breadcrumbs.addBreadcrumb(
              {
                category: 'fetch',
                data: fetchData,
                level: Severity.Error,
                type: 'http',
              },
              {
                error,
                input: args,
              },
            );

            throw error;
          });
      };
    });
  }

  /** JSDoc */
  private _instrumentHistory(): void {
    if (!supportsHistory()) {
      return;
    }

    const captureUrlChange = (from: string | undefined, to: string | undefined): void => {
      const parsedLoc = parseUrl(global.location.href);
      const parsedTo = parseUrl(to as string);
      let parsedFrom = parseUrl(from as string);

      // Initial pushState doesn't provide `from` information
      if (!parsedFrom.path) {
        parsedFrom = parsedLoc;
      }

      // because onpopstate only tells you the "new" (to) value of location.href, and
      // not the previous (from) value, we need to track the value of the current URL
      // state ourselves
      lastHref = to;

      // Use only the path component of the URL if the URL matches the current
      // document (almost all the time when using pushState)
      if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
        // tslint:disable-next-line:no-parameter-reassignment
        to = parsedTo.relative;
      }
      if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
        // tslint:disable-next-line:no-parameter-reassignment
        from = parsedFrom.relative;
      }

      Breadcrumbs.addBreadcrumb({
        category: 'navigation',
        data: {
          from,
          to,
        },
      });
    };

    // record navigation (URL) changes
    const oldOnPopState = global.onpopstate;
    global.onpopstate = (...args: any[]) => {
      const currentHref = global.location.href;
      captureUrlChange(lastHref, currentHref);
      if (oldOnPopState) {
        return oldOnPopState.apply(this, args);
      }
    };

    /**
     * @hidden
     */
    function historyReplacementFunction(originalHistoryFunction: () => void): () => void {
      // note history.pushState.length is 0; intentionally not declaring
      // params to preserve 0 arity
      return function(this: History, ...args: any[]): void {
        const url = args.length > 2 ? args[2] : undefined;
        // url argument is optional
        if (url) {
          // coerce to string (this is what pushState does)
          captureUrlChange(lastHref, String(url));
        }
        return originalHistoryFunction.apply(this, args);
      };
    }

    fill(global.history, 'pushState', historyReplacementFunction);
    fill(global.history, 'replaceState', historyReplacementFunction);
  }

  /** JSDoc */
  private _instrumentXHR(): void {
    if (!('XMLHttpRequest' in global)) {
      return;
    }

    /**
     * @hidden
     */
    function wrapProp(prop: XMLHttpRequestProp, xhr: XMLHttpRequest): void {
      if (prop in xhr && typeof xhr[prop] === 'function') {
        fill(xhr, prop, original =>
          wrap(original, {
            mechanism: {
              data: {
                function: prop,
                handler: (original && original.name) || '<anonymous>',
              },
              handled: true,
              type: 'instrument',
            },
          }),
        );
      }
    }

    const xhrproto = XMLHttpRequest.prototype;
    fill(
      xhrproto,
      'open',
      originalOpen =>
        function(this: SentryWrappedXMLHttpRequest, ...args: any[]): void {
          const url = args[1];
          this.__sentry_xhr__ = {
            method: isString(args[0]) ? args[0].toUpperCase() : args[0],
            url: args[1],
          };

          const client = getCurrentHub().getClient<BrowserClient>();
          const dsn = client && client.getDsn();
          if (dsn) {
            const filterUrl = new API(dsn).getStoreEndpoint();
            // if Sentry key appears in URL, don't capture it as a request
            // but rather as our own 'sentry' type breadcrumb
            if (isString(url) && (filterUrl && url.indexOf(filterUrl) !== -1)) {
              this.__sentry_own_request__ = true;
            }
          }

          return originalOpen.apply(this, args);
        },
    );

    fill(
      xhrproto,
      'send',
      originalSend =>
        function(this: SentryWrappedXMLHttpRequest, ...args: any[]): void {
          const xhr = this; // tslint:disable-line:no-this-assignment

          if (xhr.__sentry_own_request__) {
            addSentryBreadcrumb(args[0]);
          }

          /**
           * @hidden
           */
          function onreadystatechangeHandler(): void {
            if (xhr.readyState === 4) {
              if (xhr.__sentry_own_request__) {
                return;
              }
              try {
                // touching statusCode in some platforms throws
                // an exception
                if (xhr.__sentry_xhr__) {
                  xhr.__sentry_xhr__.status_code = xhr.status;
                }
              } catch (e) {
                /* do nothing */
              }
              Breadcrumbs.addBreadcrumb(
                {
                  category: 'xhr',
                  data: xhr.__sentry_xhr__,
                  type: 'http',
                },
                {
                  xhr,
                },
              );
            }
          }

          const xmlHttpRequestProps: XMLHttpRequestProp[] = ['onload', 'onerror', 'onprogress'];
          xmlHttpRequestProps.forEach(prop => {
            wrapProp(prop, xhr);
          });

          if ('onreadystatechange' in xhr && typeof xhr.onreadystatechange === 'function') {
            fill(xhr, 'onreadystatechange', function(original: () => void): void {
              return wrap(
                original,
                {
                  mechanism: {
                    data: {
                      function: 'onreadystatechange',
                      handler: (original && original.name) || '<anonymous>',
                    },
                    handled: true,
                    type: 'instrument',
                  },
                },
                onreadystatechangeHandler,
              );
            });
          } else {
            // if onreadystatechange wasn't actually set by the page on this xhr, we
            // are free to set our own and capture the breadcrumb
            xhr.onreadystatechange = onreadystatechangeHandler;
          }
          return originalSend.apply(this, args);
        },
    );
  }

  /**
   * Helper that checks if integration is enabled on the client.
   * @param breadcrumb Breadcrumb
   * @param hint BreadcrumbHint
   */
  public static addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
    if (getCurrentHub().getIntegration(Breadcrumbs)) {
      getCurrentHub().addBreadcrumb(breadcrumb, hint);
    }
  }

  /**
   * Instrument browser built-ins w/ breadcrumb capturing
   *  - Console API
   *  - DOM API (click/typing)
   *  - XMLHttpRequest API
   *  - Fetch API
   *  - History API
   */
  public setupOnce(): void {
    if (this._options.console) {
      this._instrumentConsole();
    }
    if (this._options.dom) {
      this._instrumentDOM();
    }
    if (this._options.xhr) {
      this._instrumentXHR();
    }
    if (this._options.fetch) {
      this._instrumentFetch();
    }
    if (this._options.history) {
      this._instrumentHistory();
    }
  }
}

/** JSDoc */
function addSentryBreadcrumb(serializedData: string): void {
  // There's always something that can go wrong with deserialization...
  try {
    const event = JSON.parse(serializedData);
    Breadcrumbs.addBreadcrumb(
      {
        category: 'sentry',
        event_id: event.event_id,
        level: event.level || Severity.fromString('error'),
        message: getEventDescription(event),
      },
      {
        event,
      },
    );
  } catch (_oO) {
    logger.error('Error while adding sentry type breadcrumb');
  }
}
