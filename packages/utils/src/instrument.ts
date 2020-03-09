/* tslint:disable:only-arrow-functions no-unsafe-any */

import { WrappedFunction } from '@sentry/types';

import { isInstanceOf, isString } from './is';
import { logger } from './logger';
import { getFunctionName, getGlobalObject } from './misc';
import { fill } from './object';
import { supportsHistory, supportsNativeFetch } from './supports';

const global = getGlobalObject<Window>();

/** Object describing handler that will be triggered for a given `type` of instrumentation */
interface InstrumentHandler {
  type: InstrumentHandlerType;
  callback: InstrumentHandlerCallback;
}
type InstrumentHandlerType =
  | 'console'
  | 'dom'
  | 'fetch'
  | 'history'
  | 'sentry'
  | 'xhr'
  | 'error'
  | 'unhandledrejection';
type InstrumentHandlerCallback = (data: any) => void;

/**
 * Instrument native APIs to call handlers that can be used to create breadcrumbs, APM spans etc.
 *  - Console API
 *  - Fetch API
 *  - XHR API
 *  - History API
 *  - DOM API (click/typing)
 *  - Error API
 *  - UnhandledRejection API
 */

const handlers: { [key in InstrumentHandlerType]?: InstrumentHandlerCallback[] } = {};
const instrumented: { [key in InstrumentHandlerType]?: boolean } = {};

/** Instruments given API */
function instrument(type: InstrumentHandlerType): void {
  if (instrumented[type]) {
    return;
  }

  instrumented[type] = true;

  switch (type) {
    case 'console':
      instrumentConsole();
      break;
    case 'dom':
      instrumentDOM();
      break;
    case 'xhr':
      instrumentXHR();
      break;
    case 'fetch':
      instrumentFetch();
      break;
    case 'history':
      instrumentHistory();
      break;
    case 'error':
      instrumentError();
      break;
    case 'unhandledrejection':
      instrumentUnhandledRejection();
      break;
    default:
      logger.warn('unknown instrumentation type:', type);
  }
}

/**
 * Add handler that will be called when given type of instrumentation triggers.
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addInstrumentationHandler(handler: InstrumentHandler): void {
  // tslint:disable-next-line:strict-type-predicates
  if (!handler || typeof handler.type !== 'string' || typeof handler.callback !== 'function') {
    return;
  }
  handlers[handler.type] = handlers[handler.type] || [];
  (handlers[handler.type] as InstrumentHandlerCallback[]).push(handler.callback);
  instrument(handler.type);
}

/** JSDoc */
function triggerHandlers(type: InstrumentHandlerType, data: any): void {
  if (!type || !handlers[type]) {
    return;
  }

  for (const handler of handlers[type] || []) {
    try {
      handler(data);
    } catch (e) {
      logger.error(
        `Error while triggering instrumentation handler.\nType: ${type}\nName: ${getFunctionName(
          handler,
        )}\nError: ${e}`,
      );
    }
  }
}

/** JSDoc */
function instrumentConsole(): void {
  if (!('console' in global)) {
    return;
  }

  ['debug', 'info', 'warn', 'error', 'log', 'assert'].forEach(function(level: string): void {
    if (!(level in global.console)) {
      return;
    }

    fill(global.console, level, function(originalConsoleLevel: () => any): Function {
      return function(...args: any[]): void {
        triggerHandlers('console', { args, level });

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
          Function.prototype.apply.call(originalConsoleLevel, global.console, args);
        }
      };
    });
  });
}

/** JSDoc */
function instrumentFetch(): void {
  if (!supportsNativeFetch()) {
    return;
  }

  fill(global, 'fetch', function(originalFetch: () => void): () => void {
    return function(...args: any[]): void {
      const commonHandlerData = {
        args,
        fetchData: {
          method: getFetchMethod(args),
          url: getFetchUrl(args),
        },
        startTimestamp: Date.now(),
      };

      triggerHandlers('fetch', {
        ...commonHandlerData,
      });

      return originalFetch.apply(global, args).then(
        (response: Response) => {
          triggerHandlers('fetch', {
            ...commonHandlerData,
            endTimestamp: Date.now(),
            response,
          });
          return response;
        },
        (error: Error) => {
          triggerHandlers('fetch', {
            ...commonHandlerData,
            endTimestamp: Date.now(),
            error,
          });
          throw error;
        },
      );
    };
  });
}

/** JSDoc */
interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
  };
}

/** Extract `method` from fetch call arguments */
function getFetchMethod(fetchArgs: any[] = []): string {
  if ('Request' in global && isInstanceOf(fetchArgs[0], Request) && fetchArgs[0].method) {
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
  if ('Request' in global && isInstanceOf(fetchArgs[0], Request)) {
    return fetchArgs[0].url;
  }
  return String(fetchArgs[0]);
}

/** JSDoc */
function instrumentXHR(): void {
  if (!('XMLHttpRequest' in global)) {
    return;
  }

  const xhrproto = XMLHttpRequest.prototype;

  fill(xhrproto, 'open', function(originalOpen: () => void): () => void {
    return function(this: SentryWrappedXMLHttpRequest, ...args: any[]): void {
      const url = args[1];
      this.__sentry_xhr__ = {
        method: isString(args[0]) ? args[0].toUpperCase() : args[0],
        url: args[1],
      };

      // if Sentry key appears in URL, don't capture it as a request
      if (isString(url) && this.__sentry_xhr__.method === 'POST' && url.match(/sentry_key/)) {
        this.__sentry_own_request__ = true;
      }

      return originalOpen.apply(this, args);
    };
  });

  fill(xhrproto, 'send', function(originalSend: () => void): () => void {
    return function(this: SentryWrappedXMLHttpRequest, ...args: any[]): void {
      const xhr = this; // tslint:disable-line:no-this-assignment
      const commonHandlerData = {
        args,
        startTimestamp: Date.now(),
        xhr,
      };

      triggerHandlers('xhr', {
        ...commonHandlerData,
      });

      xhr.addEventListener('readystatechange', function(): void {
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
          triggerHandlers('xhr', {
            ...commonHandlerData,
            endTimestamp: Date.now(),
          });
        }
      });

      return originalSend.apply(this, args);
    };
  });
}

let lastHref: string;

/** JSDoc */
function instrumentHistory(): void {
  if (!supportsHistory()) {
    return;
  }

  const oldOnPopState = global.onpopstate;
  global.onpopstate = function(this: WindowEventHandlers, ...args: any[]): any {
    const to = global.location.href;
    // keep track of the current URL state, as we always receive only the updated state
    const from = lastHref;
    lastHref = to;
    triggerHandlers('history', {
      from,
      to,
    });
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
        const from = lastHref;
        const to = String(url);
        // keep track of the current URL state, as we always receive only the updated state
        lastHref = to;
        triggerHandlers('history', {
          from,
          to,
        });
      }
      return originalHistoryFunction.apply(this, args);
    };
  }

  fill(global.history, 'pushState', historyReplacementFunction);
  fill(global.history, 'replaceState', historyReplacementFunction);
}

/** JSDoc */
function instrumentDOM(): void {
  if (!('document' in global)) {
    return;
  }

  // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
  // to the document. Do this before we instrument addEventListener.
  global.document.addEventListener('click', domEventHandler('click', triggerHandlers.bind(null, 'dom')), false);
  global.document.addEventListener('keypress', keypressEventHandler(triggerHandlers.bind(null, 'dom')), false);

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
                domEventHandler('click', triggerHandlers.bind(null, 'dom'))(event);
                return innerOriginal.call(this, event);
              };
            });
          }
          if (eventName === 'keypress') {
            fill(fn, 'handleEvent', function(innerOriginal: () => void): (caughtEvent: Event) => void {
              return function(this: any, event: Event): (event: Event) => void {
                keypressEventHandler(triggerHandlers.bind(null, 'dom'))(event);
                return innerOriginal.call(this, event);
              };
            });
          }
        } else {
          if (eventName === 'click') {
            domEventHandler('click', triggerHandlers.bind(null, 'dom'), true)(this);
          }
          if (eventName === 'keypress') {
            keypressEventHandler(triggerHandlers.bind(null, 'dom'))(this);
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

const debounceDuration: number = 1000;
let debounceTimer: number = 0;
let keypressTimeout: number | undefined;
let lastCapturedEvent: Event | undefined;

/**
 * Wraps addEventListener to capture UI breadcrumbs
 * @param name the event name (e.g. "click")
 * @param handler function that will be triggered
 * @param debounce decides whether it should wait till another event loop
 * @returns wrapped breadcrumb events handler
 * @hidden
 */
function domEventHandler(name: string, handler: Function, debounce: boolean = false): (event: Event) => void {
  return (event: Event) => {
    // reset keypress timeout; e.g. triggering a 'click' after
    // a 'keypress' will reset the keypress debounce so that a new
    // set of keypresses can be recorded
    keypressTimeout = undefined;
    // It's possible this handler might trigger multiple times for the same
    // event (e.g. event propagation through node ancestors). Ignore if we've
    // already captured the event.
    if (!event || lastCapturedEvent === event) {
      return;
    }

    lastCapturedEvent = event;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (debounce) {
      debounceTimer = setTimeout(() => {
        handler({ event, name });
      });
    } else {
      handler({ event, name });
    }
  };
}

/**
 * Wraps addEventListener to capture keypress UI events
 * @param handler function that will be triggered
 * @returns wrapped keypress events handler
 * @hidden
 */
function keypressEventHandler(handler: Function): (event: Event) => void {
  // TODO: if somehow user switches keypress target before
  //       debounce timeout is triggered, we will only capture
  //       a single breadcrumb from the FIRST target (acceptable?)
  return (event: Event) => {
    let target;

    try {
      target = event.target;
    } catch (e) {
      // just accessing event properties can throw an exception in some rare circumstances
      // see: https://github.com/getsentry/raven-js/issues/838
      return;
    }

    const tagName = target && (target as HTMLElement).tagName;

    // only consider keypress events on actual input elements
    // this will disregard keypresses targeting body (e.g. tabbing
    // through elements, hotkeys, etc)
    if (!tagName || (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && !(target as HTMLElement).isContentEditable)) {
      return;
    }

    // record first keypress in a series, but ignore subsequent
    // keypresses until debounce clears
    if (!keypressTimeout) {
      domEventHandler('input', handler)(event);
    }
    clearTimeout(keypressTimeout);

    keypressTimeout = (setTimeout(() => {
      keypressTimeout = undefined;
    }, debounceDuration) as any) as number;
  };
}

let _oldOnErrorHandler: OnErrorEventHandler = null;
/** JSDoc */
function instrumentError(): void {
  _oldOnErrorHandler = global.onerror;

  global.onerror = function(msg: any, url: any, line: any, column: any, error: any): boolean {
    triggerHandlers('error', {
      column,
      error,
      line,
      msg,
      url,
    });

    if (_oldOnErrorHandler) {
      return _oldOnErrorHandler.apply(this, arguments);
    }

    return false;
  };
}

let _oldOnUnhandledRejectionHandler: ((e: any) => void) | null = null;
/** JSDoc */
function instrumentUnhandledRejection(): void {
  _oldOnUnhandledRejectionHandler = global.onunhandledrejection;

  global.onunhandledrejection = function(e: any): boolean {
    triggerHandlers('unhandledrejection', e);

    if (_oldOnUnhandledRejectionHandler) {
      return _oldOnUnhandledRejectionHandler.apply(this, arguments);
    }

    return true;
  };
}
