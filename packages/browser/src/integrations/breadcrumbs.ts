import { getDefaultHub } from '@sentry/hub';
import { Integration, Severity } from '@sentry/types';
import { isFunction, isString } from '@sentry/utils/is';
import { getGlobalObject, parseUrl } from '@sentry/utils/misc';
import { fill } from '@sentry/utils/object';
import { safeJoin } from '@sentry/utils/string';
import { supportsFetch, supportsHistory } from '@sentry/utils/supports';
import { breadcrumbEventHandler, keypressEventHandler, wrap } from './helpers';

const global = getGlobalObject() as Window;
let lastHref: string | undefined;

/**
 * TODO
 */
interface ExtensibleConsole extends Console {
  [key: string]: any;
}

/**
 * TODO
 */
export interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
  };
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
    private readonly options: {
      console?: boolean;
      dom?: boolean;
      fetch?: boolean;
      history?: boolean;
      xhr?: boolean;
    } = {
      console: true,
      dom: true,
      fetch: true,
      history: true,
      xhr: true,
    },
  ) {}
  /**
   * TODO
   */
  private instrumentConsole(): void {
    if (!('console' in global)) {
      return;
    }

    const originalConsole = global.console as ExtensibleConsole;

    ['debug', 'info', 'warn', 'error', 'log'].forEach(level => {
      if (!(level in console)) {
        return;
      }

      // tslint:disable-next-line
      const originalConsoleLevel = originalConsole[level];

      (global.console as ExtensibleConsole)[level] = function(
        ...args: any[]
      ): void {
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
            breadcrumbData.message = `Assertion failed: ${safeJoin(
              args.slice(1),
              ' ',
            ) || 'console.assert'}`;
            breadcrumbData.data.extra.arguments = args.slice(1);
          }
        }

        getDefaultHub().addBreadcrumb(breadcrumbData);

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
          Function.prototype.apply.call(
            originalConsoleLevel,
            originalConsole,
            args,
          );
        }
      };
    });
  }
  /**
   * TODO
   */
  private instrumentDOM(): void {
    if (!('document' in global)) {
      return;
    }
    // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
    // to the document. Do this before we instrument addEventListener.
    global.document.addEventListener(
      'click',
      breadcrumbEventHandler('click'),
      false,
    );
    global.document.addEventListener('keypress', keypressEventHandler(), false);
  }
  /**
   * TODO
   */
  private instrumentFetch(): void {
    if (!supportsFetch()) {
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

        // TODO: Filter our own requests
        // if Sentry key appears in URL, don't capture, as it's our own request
        // if (url.indexOf(self._globalKey) !== -1) {
        //   return originalFetch.apply(this, args);
        // }

        if (args[1] && args[1].method) {
          method = args[1].method;
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
            getDefaultHub().addBreadcrumb({
              category: 'fetch',
              data: fetchData,
              type: 'http',
            });
            return response;
          })
          .catch((error: Error) => {
            getDefaultHub().addBreadcrumb({
              category: 'fetch',
              data: fetchData,
              level: Severity.Error,
              type: 'http',
            });

            throw error;
          });
      };
    });
  }
  /**
   * TODO
   */
  private instrumentHistory(): void {
    if (!supportsHistory()) {
      return;
    }

    const captureUrlChange = (
      from: string | undefined,
      to: string | undefined,
    ): void => {
      const parsedLoc = parseUrl(global.location.href);
      const parsedTo = parseUrl(to as string);
      const parsedFrom = parseUrl(from as string);

      // because onpopstate only tells you the "new" (to) value of location.href, and
      // not the previous (from) value, we need to track the value of the current URL
      // state ourselves
      lastHref = to;

      // Use only the path component of the URL if the URL matches the current
      // document (almost all the time when using pushState)
      if (
        parsedLoc.protocol === parsedTo.protocol &&
        parsedLoc.host === parsedTo.host
      ) {
        // tslint:disable-next-line:no-parameter-reassignment
        to = parsedTo.relative;
      }
      if (
        parsedLoc.protocol === parsedFrom.protocol &&
        parsedLoc.host === parsedFrom.host
      ) {
        // tslint:disable-next-line:no-parameter-reassignment
        from = parsedFrom.relative;
      }

      getDefaultHub().addBreadcrumb({
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
        return oldOnPopState.apply(global, args);
      }
    };

    /**
     * TODO
     */
    function historyReplacementFunction(
      originalHistoryFunction: () => void,
    ): () => void {
      // note history.pushState.length is 0; intentionally not declaring
      // params to preserve 0 arity
      return function(...args: any[]): void {
        const url = args.length > 2 ? args[2] : undefined;
        // url argument is optional
        if (url) {
          // coerce to string (this is what pushState does)
          captureUrlChange(lastHref, String(url));
        }
        return originalHistoryFunction.apply(global, ...args);
      };
    }

    fill(global.history, 'pushState', historyReplacementFunction);
    fill(global.history, 'replaceState', historyReplacementFunction);
  }
  /**
   * TODO
   */
  private instrumentXHR(): void {
    if (!('XMLHttpRequest' in global)) {
      return;
    }

    /**
     * TODO
     */
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
          // TODO: Filter our own requests
          // preserve arity
          // if Sentry key appears in URL, don't capture
          // && url.indexOf(self._globalKey) === -1)
          if (isString(args[1])) {
            this.__sentry_xhr__ = {
              method: args[0],
              url: args[1],
            };
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

          /**
           * TODO
           */
          function onreadystatechangeHandler(): void {
            if (xhr.__sentry_xhr__ && xhr.readyState === 4) {
              try {
                // touching statusCode in some platforms throws
                // an exception
                xhr.__sentry_xhr__.status_code = xhr.status;
              } catch (e) {
                /* do nothing */
              }
              getDefaultHub().addBreadcrumb({
                category: 'xhr',
                data: xhr.__sentry_xhr__,
                type: 'http',
              });
            }
          }

          ['onload', 'onerror', 'onprogress'].forEach(prop => {
            wrapProp(prop, xhr);
          });

          if (
            'onreadystatechange' in xhr &&
            isFunction(xhr.onreadystatechange)
          ) {
            fill(xhr, 'onreadystatechange', function(
              original: () => void,
            ): void {
              return wrap(
                original,
                {
                  mechanism: {
                    data: {
                      function: 'onreadystatechange',
                      handler: (original && original.name) || '<anonymous>',
                    },
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
          return originalSend.apply(XMLHttpRequest, args);
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
  public install(): void {
    if (this.options.console) {
      this.instrumentConsole();
    }
    if (this.options.dom) {
      this.instrumentDOM();
    }
    if (this.options.xhr) {
      this.instrumentXHR();
    }
    if (this.options.fetch) {
      this.instrumentFetch();
    }
    if (this.options.history) {
      this.instrumentHistory();
    }
  }
}
