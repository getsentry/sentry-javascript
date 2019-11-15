// TODO: Rename this whole file to `instrument.ts` and make a distinction between instrumenting (wrapping the API)
//       and creating a breadcrumb (writing an `InstrumentHandler`)

import { API, getCurrentHub } from '@sentry/core';
import { Integration, WrappedFunction } from '@sentry/types';
import { fill, getGlobalObject, isString, logger, supportsHistory, supportsNativeFetch } from '@sentry/utils';

import { BrowserClient } from '../client';
import { breadcrumbEventHandler, keypressEventHandler, wrap } from '../helpers';

import {
  defaultHandlers,
  InstrumentHandler,
  InstrumentHandlerCallback,
  InstrumentHandlerType,
} from './instrumenthandlers';

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
  handlers?: InstrumentHandler[];
}

type XMLHttpRequestProp = 'onload' | 'onerror' | 'onprogress';

/**
 * Default Breadcrumbs instrumentations
 * @deprecated With v6, this will be renamed
 */
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

  /** JSDoc */
  private readonly _handlers: { [key in InstrumentHandlerType]: InstrumentHandlerCallback[] } = {
    console: [],
    dom: [],
    fetch: [],
    history: [],
    sentry: [],
    xhr: [],
  };

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
    this._setupHandlers([...defaultHandlers, ...(this._options.handlers || [])]);
  }

  /** JSDoc */
  private _setupHandlers(handlers: InstrumentHandler[]): void {
    for (const handler of handlers) {
      // tslint:disable-next-line:strict-type-predicates
      if (!handler || typeof handler.type !== 'string' || typeof handler.callback !== 'function') {
        continue;
      }
      this._handlers[handler.type].push(handler.callback);
    }
  }

  /** JSDoc */
  private _triggerHandlers(type: InstrumentHandlerType, data: any): void {
    if (!getCurrentHub().getIntegration(Breadcrumbs)) {
      return;
    }

    if (!type || !this._handlers[type]) {
      return;
    }

    for (const handler of this._handlers[type]) {
      try {
        handler(data);
      } catch (e) {
        logger.error(
          `Error while triggering instrumentation handler.\nType: ${type}\nName: ${handler.name ||
            '<anonymous>'}\nError: ${e}`,
        );
      }
    }
  }

  /** JSDoc */
  private _instrumentConsole(): void {
    if (!('console' in global)) {
      return;
    }

    const triggerHandlers = this._triggerHandlers.bind(this, 'console');

    ['debug', 'info', 'warn', 'error', 'log', 'assert'].forEach(function(level: string): void {
      if (!(level in global.console)) {
        return;
      }

      fill(global.console, level, function(originalConsoleLevel: () => any): Function {
        return function(...args: any[]): void {
          const handlerData = {
            args,
            level,
          };
          triggerHandlers(handlerData);

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

    const triggerHandlers = this._triggerHandlers.bind(this, 'fetch');

    fill(global, 'fetch', function(originalFetch: () => void): () => void {
      return function(...args: any[]): void {
        const handlerData: { [key: string]: any } = {
          args,
          endTimestamp: Date.now(),
          fetchData: {
            method: getFetchMethod(args),
            url: getFetchUrl(args),
          },
          startTimestamp: Date.now(),
        };

        return originalFetch.apply(global, args).then(
          (response: Response) => {
            handlerData.endTimestamp = Date.now();
            handlerData.response = response;
            handlerData.fetchData.status_code = response.status;
            triggerHandlers(handlerData);
            return response;
          },
          (error: Error) => {
            handlerData.endTimestamp = Date.now();
            handlerData.error = error;
            triggerHandlers(handlerData);
            throw error;
          },
        );
      };
    });
  }

  /** JSDoc */
  private _instrumentHistory(): void {
    if (!supportsHistory()) {
      return;
    }

    const triggerHandlers = this._triggerHandlers.bind(this, 'history');

    const oldOnPopState = global.onpopstate;
    global.onpopstate = (...args: any[]) => {
      const to = global.location.href;
      const handlerData = {
        from: lastHref,
        to,
      };
      // keep track of the current URL state, as we always receive only the updated state
      lastHref = to;
      triggerHandlers(handlerData);
      if (oldOnPopState) {
        return oldOnPopState.apply(this, args);
      }
    };

    /** @hidden */
    function historyReplacementFunction(originalHistoryFunction: () => void): () => void {
      return function(this: History, ...args: any[]): void {
        const url = args.length > 2 ? args[2] : undefined;
        if (url) {
          // coerce to string (this is what pushState does)
          const to = String(url);
          const handlerData = {
            from: lastHref,
            to,
          };
          // keep track of the current URL state, as we always receive only the updated state
          lastHref = to;
          triggerHandlers(handlerData);
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

    const triggerHandlers = this._triggerHandlers.bind(this, 'xhr');

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
          const handlerData: { [key: string]: any } = {
            args,
            endTimestamp: Date.now(),
            startTimestamp: Date.now(),
            xhr,
          };

          triggerHandlers(handlerData);

          /**
           * @hidden
           */
          function onreadystatechangeHandler(): void {
            if (xhr.readyState === 4) {
              try {
                // touching statusCode in some platforms throws
                // an exception
                if (xhr.__sentry_xhr__) {
                  xhr.__sentry_xhr__.status_code = xhr.status;
                }
              } catch (e) {
                /* do nothing */
              }
              handlerData.endTimestamp = Date.now();
              handlerData.requestComplete = true;
              triggerHandlers(handlerData);
            }
          }

          const xmlHttpRequestProps: XMLHttpRequestProp[] = ['onload', 'onerror', 'onprogress'];
          xmlHttpRequestProps.forEach(prop => {
            wrapProp(prop, xhr);
          });

          if ('onreadystatechange' in xhr && typeof xhr.onreadystatechange === 'function') {
            fill(xhr, 'onreadystatechange', function(original: () => void): Function {
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

/** Extract `method` from fetch call arguments */
function getFetchMethod(fetchArgs: any[] = []): string {
  if ('Request' in global && fetchArgs[0] instanceof Request && fetchArgs[0].method) {
    return String(fetchArgs[0].method).toUpperCase();
  }
  if (fetchArgs[1] && fetchArgs[1].method) {
    return String(fetchArgs[1].method).toUpperCase();
  }
  return 'GET';
}

/** Extract `url` from fetch call arguments */
function getFetchUrl(fetchArgs: any[] = []): string {
  if (typeof fetchArgs[0] === 'string') {
    return fetchArgs[0];
  }
  if ('Request' in global && fetchArgs[0] instanceof Request) {
    return fetchArgs[0].url;
  }
  return String(fetchArgs[0]);
}
