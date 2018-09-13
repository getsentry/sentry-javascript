import { API, logger } from '@sentry/core';
import { getCurrentHub } from '@sentry/hub';
import { Integration, Severity } from '@sentry/types';
import { isFunction, isString } from '@sentry/utils/is';
import { getGlobalObject, parseUrl } from '@sentry/utils/misc';
import { deserialize, fill } from '@sentry/utils/object';
import { safeJoin } from '@sentry/utils/string';
import { supportsBeacon, supportsHistory, supportsNativeFetch } from '@sentry/utils/supports';
import { BrowserOptions } from '../backend';
import { breadcrumbEventHandler, keypressEventHandler, wrap } from './helpers';

const global = getGlobalObject() as Window;
let lastHref: string | undefined;

/** JSDoc */
interface ExtensibleConsole extends Console {
  [key: string]: any;
}

/** JSDoc */
export interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
  };
}

/**
 * Wrapper function that'll be used for every console level
 */
function consoleWrapper(originalConsole: ExtensibleConsole): any {
  return function(level: string): any {
    if (!(level in global.console)) {
      return;
    }

    fill(originalConsole, level, function(originalConsoleLevel: () => any): any {
      return function(...args: any[]): any {
        const breadcrumbData = {
          category: 'console',
          data: {
            extra: {
              arguments: args.slice(1),
            },
            logger: 'console',
          },
          level: Severity.fromString(level),
          message: safeJoin(args, ' '),
        };

        if (level === 'assert') {
          if (args[0] === false) {
            breadcrumbData.message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
            breadcrumbData.data.extra.arguments = args.slice(1);
          }
        }

        getCurrentHub().addBreadcrumb(breadcrumbData, {
          input: args,
          level,
        });

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
          originalConsoleLevel.apply(originalConsole, args);
        }
      };
    });
  };
}

/** JSDoc */
function addSentryBreadcrumb(serializedData: string): void {
  // There's always something that can go wrong with deserialization...
  try {
    const event: { [key: string]: any } = deserialize(serializedData);
    const exception = event.exception && event.exception.values && event.exception.values[0];

    getCurrentHub().addBreadcrumb(
      {
        category: 'sentry',
        event_id: event.event_id,
        level: event.level || Severity.fromString('error'),
        message: exception ? `${exception.type ? `${exception.type}: ` : ''}${exception.value}` : event.message,
      },
      {
        event,
      },
    );
  } catch (_oO) {
    logger.error('Error while adding sentry type breadcrumb');
  }
}

/** Default Breadcrumbs instrumentations */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Breadcrumbs';

  /**
   * @inheritDoc
   */
  public constructor(
    private readonly config: {
      beacon?: boolean;
      console?: boolean;
      dom?: boolean;
      fetch?: boolean;
      history?: boolean;
      sentry?: boolean;
      xhr?: boolean;
    } = {
      beacon: true,
      console: true,
      dom: true,
      fetch: true,
      history: true,
      sentry: true,
      xhr: true,
    },
  ) {}

  /** JSDoc */
  private instrumentBeacon(options: { filterUrl?: string }): void {
    if (!supportsBeacon()) {
      return;
    }

    /** JSDoc */
    function beaconReplacementFunction(originalBeaconFunction: () => void): () => void {
      return function(this: History, ...args: any[]): void {
        const url = args[0];
        const data = args[1];
        // If the browser successfully queues the request for delivery, the method returns "true" and returns "false" otherwise.
        // https://developer.mozilla.org/en-US/docs/Web/API/Beacon_API/Using_the_Beacon_API
        const result = originalBeaconFunction.apply(this, args);

        // if Sentry key appears in URL, don't capture it as a request
        // but rather as our own 'sentry' type breadcrumb
        if (options.filterUrl && url.includes(options.filterUrl)) {
          addSentryBreadcrumb(data);
          return result;
        }

        // What is wrong with you TypeScript...
        const breadcrumbData = ({
          category: 'beacon',
          data,
          type: 'http',
        } as any) as { [key: string]: any };

        if (!result) {
          breadcrumbData.level = Severity.Error;
        }

        getCurrentHub().addBreadcrumb(breadcrumbData, {
          input: args,
          result,
        });

        return result;
      };
    }

    fill(global.navigator, 'sendBeacon', beaconReplacementFunction);
  }

  /** JSDoc */
  private instrumentConsole(): void {
    if (!('console' in global)) {
      return;
    }
    const originalConsole = global.console as ExtensibleConsole;
    ['debug', 'info', 'warn', 'error', 'log'].forEach(consoleWrapper(originalConsole));
  }

  /** JSDoc */
  private instrumentDOM(): void {
    if (!('document' in global)) {
      return;
    }
    // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
    // to the document. Do this before we instrument addEventListener.
    global.document.addEventListener('click', breadcrumbEventHandler('click'), false);
    global.document.addEventListener('keypress', keypressEventHandler(), false);
  }

  /** JSDoc */
  private instrumentFetch(options: { filterUrl?: string }): void {
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

        // if Sentry key appears in URL, don't capture it as a request
        // but rather as our own 'sentry' type breadcrumb
        if (options.filterUrl && url.includes(options.filterUrl)) {
          if (method === 'POST' && args[1] && args[1].body) {
            addSentryBreadcrumb(args[1].body);
          }
          return originalFetch.apply(global, args);
        }

        const fetchData: {
          method: string;
          url: string;
          status_code?: number;
        } = {
          method,
          url,
        };

        return originalFetch
          .apply(global, args)
          .then((response: Response) => {
            fetchData.status_code = response.status;
            getCurrentHub().addBreadcrumb(
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
            getCurrentHub().addBreadcrumb(
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
  private instrumentHistory(): void {
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

      getCurrentHub().addBreadcrumb({
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

    /** JSDoc */
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
  private instrumentXHR(options: { filterUrl?: string }): void {
    if (!('XMLHttpRequest' in global)) {
      return;
    }

    /** JSDoc */
    function wrapProp(prop: string, xhr: XMLHttpRequest): void {
      // TODO: Fix XHR types
      if (prop in xhr && isFunction((xhr as { [key: string]: any })[prop])) {
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
            method: args[0],
            url: args[1],
          };
          // if Sentry key appears in URL, don't capture it as a request
          // but rather as our own 'sentry' type breadcrumb
          if (isString(url) && (options.filterUrl && url.includes(options.filterUrl))) {
            this.__sentry_own_request__ = true;
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

          /** JSDoc */
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
              getCurrentHub().addBreadcrumb(
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

          ['onload', 'onerror', 'onprogress'].forEach(prop => {
            wrapProp(prop, xhr);
          });

          if ('onreadystatechange' in xhr && isFunction(xhr.onreadystatechange)) {
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
   * Instrument browser built-ins w/ breadcrumb capturing
   *  - Console API
   *  - DOM API (click/typing)
   *  - XMLHttpRequest API
   *  - Fetch API
   *  - History API
   *
   * Can be disabled or individually configured via the `autoBreadcrumbs` config option
   */
  public install(options: BrowserOptions = {}): void {
    const filterUrl = options.dsn && new API(options.dsn).getStoreEndpoint();

    if (this.config.console) {
      this.instrumentConsole();
    }
    if (this.config.dom) {
      this.instrumentDOM();
    }
    if (this.config.xhr) {
      this.instrumentXHR({ filterUrl });
    }
    if (this.config.fetch) {
      this.instrumentFetch({ filterUrl });
    }
    if (this.config.beacon) {
      this.instrumentBeacon({ filterUrl });
    }
    if (this.config.history) {
      this.instrumentHistory();
    }
  }
}
