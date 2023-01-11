/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { WrappedFunction } from '@sentry/types';

import { isInstanceOf, isString } from './is';
import { CONSOLE_LEVELS, logger } from './logger';
import { fill } from './object';
import { getFunctionName } from './stacktrace';
import { supportsHistory, supportsNativeFetch } from './supports';
import { getGlobalObject } from './worldwide';

// eslint-disable-next-line deprecation/deprecation
const WINDOW = getGlobalObject<Window>();

export type InstrumentHandlerType =
  | 'console'
  | 'dom'
  | 'fetch'
  | 'history'
  | 'sentry'
  | 'xhr'
  | 'error'
  | 'unhandledrejection';
export type InstrumentHandlerCallback = (data: any) => void;

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
      __DEBUG_BUILD__ && logger.warn('unknown instrumentation type:', type);
      return;
  }
}

/**
 * Add handler that will be called when given type of instrumentation triggers.
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addInstrumentationHandler(type: InstrumentHandlerType, callback: InstrumentHandlerCallback): void {
  handlers[type] = handlers[type] || [];
  (handlers[type] as InstrumentHandlerCallback[]).push(callback);
  instrument(type);
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
      __DEBUG_BUILD__ &&
        logger.error(
          `Error while triggering instrumentation handler.\nType: ${type}\nName: ${getFunctionName(handler)}\nError:`,
          e,
        );
    }
  }
}

/** JSDoc */
function instrumentConsole(): void {
  if (!('console' in WINDOW)) {
    return;
  }

  CONSOLE_LEVELS.forEach(function (level: string): void {
    if (!(level in WINDOW.console)) {
      return;
    }

    fill(WINDOW.console, level, function (originalConsoleMethod: () => any): Function {
      return function (...args: any[]): void {
        triggerHandlers('console', { args, level });

        // this fails for some browsers. :(
        if (originalConsoleMethod) {
          originalConsoleMethod.apply(WINDOW.console, args);
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

  fill(WINDOW, 'fetch', function (originalFetch: () => void): () => void {
    return function (...args: any[]): void {
      const handlerData = {
        args,
        fetchData: {
          method: getFetchMethod(args),
          url: getFetchUrl(args),
        },
        startTimestamp: Date.now(),
      };

      triggerHandlers('fetch', {
        ...handlerData,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalFetch.apply(WINDOW, args).then(
        (response: Response) => {
          triggerHandlers('fetch', {
            ...handlerData,
            endTimestamp: Date.now(),
            response,
          });
          return response;
        },
        (error: Error) => {
          triggerHandlers('fetch', {
            ...handlerData,
            endTimestamp: Date.now(),
            error,
          });
          // NOTE: If you are a Sentry user, and you are seeing this stack frame,
          //       it means the sentry.javascript SDK caught an error invoking your application code.
          //       This is expected behavior and NOT indicative of a bug with sentry.javascript.
          throw error;
        },
      );
    };
  });
}

type XHRSendInput = null | Blob | BufferSource | FormData | URLSearchParams | string;

/** JSDoc */
interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
    body?: XHRSendInput;
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/** Extract `method` from fetch call arguments */
function getFetchMethod(fetchArgs: any[] = []): string {
  if ('Request' in WINDOW && isInstanceOf(fetchArgs[0], Request) && fetchArgs[0].method) {
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
  if ('Request' in WINDOW && isInstanceOf(fetchArgs[0], Request)) {
    return fetchArgs[0].url;
  }
  return String(fetchArgs[0]);
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access */

/** JSDoc */
function instrumentXHR(): void {
  if (!('XMLHttpRequest' in WINDOW)) {
    return;
  }

  const xhrproto = XMLHttpRequest.prototype;

  fill(xhrproto, 'open', function (originalOpen: () => void): () => void {
    return function (this: SentryWrappedXMLHttpRequest, ...args: any[]): void {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhr = this;
      const url = args[1];
      const xhrInfo: SentryWrappedXMLHttpRequest['__sentry_xhr__'] = (xhr.__sentry_xhr__ = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        method: isString(args[0]) ? args[0].toUpperCase() : args[0],
        url: args[1],
      });

      // if Sentry key appears in URL, don't capture it as a request
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (isString(url) && xhrInfo.method === 'POST' && url.match(/sentry_key/)) {
        xhr.__sentry_own_request__ = true;
      }

      const onreadystatechangeHandler = function (): void {
        if (xhr.readyState === 4) {
          try {
            // touching statusCode in some platforms throws
            // an exception
            xhrInfo.status_code = xhr.status;
          } catch (e) {
            /* do nothing */
          }

          triggerHandlers('xhr', {
            args,
            endTimestamp: Date.now(),
            startTimestamp: Date.now(),
            xhr,
          });
        }
      };

      if ('onreadystatechange' in xhr && typeof xhr.onreadystatechange === 'function') {
        fill(xhr, 'onreadystatechange', function (original: WrappedFunction): Function {
          return function (...readyStateArgs: any[]): void {
            onreadystatechangeHandler();
            return original.apply(xhr, readyStateArgs);
          };
        });
      } else {
        xhr.addEventListener('readystatechange', onreadystatechangeHandler);
      }

      return originalOpen.apply(xhr, args);
    };
  });

  fill(xhrproto, 'send', function (originalSend: () => void): () => void {
    return function (this: SentryWrappedXMLHttpRequest, ...args: any[]): void {
      if (this.__sentry_xhr__ && args[0] !== undefined) {
        this.__sentry_xhr__.body = args[0];
      }

      triggerHandlers('xhr', {
        args,
        startTimestamp: Date.now(),
        xhr: this,
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

  const oldOnPopState = WINDOW.onpopstate;
  WINDOW.onpopstate = function (this: WindowEventHandlers, ...args: any[]): any {
    const to = WINDOW.location.href;
    // keep track of the current URL state, as we always receive only the updated state
    const from = lastHref;
    lastHref = to;
    triggerHandlers('history', {
      from,
      to,
    });
    if (oldOnPopState) {
      // Apparently this can throw in Firefox when incorrectly implemented plugin is installed.
      // https://github.com/getsentry/sentry-javascript/issues/3344
      // https://github.com/bugsnag/bugsnag-js/issues/469
      try {
        return oldOnPopState.apply(this, args);
      } catch (_oO) {
        // no-empty
      }
    }
  };

  /** @hidden */
  function historyReplacementFunction(originalHistoryFunction: () => void): () => void {
    return function (this: History, ...args: any[]): void {
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

  fill(WINDOW.history, 'pushState', historyReplacementFunction);
  fill(WINDOW.history, 'replaceState', historyReplacementFunction);
}

const debounceDuration = 1000;
let debounceTimerID: number | undefined;
let lastCapturedEvent: Event | undefined;

/**
 * Decide whether the current event should finish the debounce of previously captured one.
 * @param previous previously captured event
 * @param current event to be captured
 */
function shouldShortcircuitPreviousDebounce(previous: Event | undefined, current: Event): boolean {
  // If there was no previous event, it should always be swapped for the new one.
  if (!previous) {
    return true;
  }

  // If both events have different type, then user definitely performed two separate actions. e.g. click + keypress.
  if (previous.type !== current.type) {
    return true;
  }

  try {
    // If both events have the same type, it's still possible that actions were performed on different targets.
    // e.g. 2 clicks on different buttons.
    if (previous.target !== current.target) {
      return true;
    }
  } catch (e) {
    // just accessing `target` property can throw an exception in some rare circumstances
    // see: https://github.com/getsentry/sentry-javascript/issues/838
  }

  // If both events have the same type _and_ same `target` (an element which triggered an event, _not necessarily_
  // to which an event listener was attached), we treat them as the same action, as we want to capture
  // only one breadcrumb. e.g. multiple clicks on the same button, or typing inside a user input box.
  return false;
}

/**
 * Decide whether an event should be captured.
 * @param event event to be captured
 */
function shouldSkipDOMEvent(event: Event): boolean {
  // We are only interested in filtering `keypress` events for now.
  if (event.type !== 'keypress') {
    return false;
  }

  try {
    const target = event.target as HTMLElement;

    if (!target || !target.tagName) {
      return true;
    }

    // Only consider keypress events on actual input elements. This will disregard keypresses targeting body
    // e.g.tabbing through elements, hotkeys, etc.
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return false;
    }
  } catch (e) {
    // just accessing `target` property can throw an exception in some rare circumstances
    // see: https://github.com/getsentry/sentry-javascript/issues/838
  }

  return true;
}

/**
 * Wraps addEventListener to capture UI breadcrumbs
 * @param handler function that will be triggered
 * @param globalListener indicates whether event was captured by the global event listener
 * @returns wrapped breadcrumb events handler
 * @hidden
 */
function makeDOMEventHandler(handler: Function, globalListener: boolean = false): (event: Event) => void {
  return (event: Event): void => {
    // It's possible this handler might trigger multiple times for the same
    // event (e.g. event propagation through node ancestors).
    // Ignore if we've already captured that event.
    if (!event || lastCapturedEvent === event) {
      return;
    }

    // We always want to skip _some_ events.
    if (shouldSkipDOMEvent(event)) {
      return;
    }

    const name = event.type === 'keypress' ? 'input' : event.type;

    // If there is no debounce timer, it means that we can safely capture the new event and store it for future comparisons.
    if (debounceTimerID === undefined) {
      handler({
        event: event,
        name,
        global: globalListener,
      });
      lastCapturedEvent = event;
    }
    // If there is a debounce awaiting, see if the new event is different enough to treat it as a unique one.
    // If that's the case, emit the previous event and store locally the newly-captured DOM event.
    else if (shouldShortcircuitPreviousDebounce(lastCapturedEvent, event)) {
      handler({
        event: event,
        name,
        global: globalListener,
      });
      lastCapturedEvent = event;
    }

    // Start a new debounce timer that will prevent us from capturing multiple events that should be grouped together.
    clearTimeout(debounceTimerID);
    debounceTimerID = WINDOW.setTimeout(() => {
      debounceTimerID = undefined;
    }, debounceDuration);
  };
}

type AddEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => void;
type RemoveEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
) => void;

type InstrumentedElement = Element & {
  __sentry_instrumentation_handlers__?: {
    [key in 'click' | 'keypress']?: {
      handler?: Function;
      /** The number of custom listeners attached to this element */
      refCount: number;
    };
  };
};

/** JSDoc */
function instrumentDOM(): void {
  if (!('document' in WINDOW)) {
    return;
  }

  // Make it so that any click or keypress that is unhandled / bubbled up all the way to the document triggers our dom
  // handlers. (Normally we have only one, which captures a breadcrumb for each click or keypress.) Do this before
  // we instrument `addEventListener` so that we don't end up attaching this handler twice.
  const triggerDOMHandler = triggerHandlers.bind(null, 'dom');
  const globalDOMEventHandler = makeDOMEventHandler(triggerDOMHandler, true);
  WINDOW.document.addEventListener('click', globalDOMEventHandler, false);
  WINDOW.document.addEventListener('keypress', globalDOMEventHandler, false);

  // After hooking into click and keypress events bubbled up to `document`, we also hook into user-handled
  // clicks & keypresses, by adding an event listener of our own to any element to which they add a listener. That
  // way, whenever one of their handlers is triggered, ours will be, too. (This is needed because their handler
  // could potentially prevent the event from bubbling up to our global listeners. This way, our handler are still
  // guaranteed to fire at least once.)
  ['EventTarget', 'Node'].forEach((target: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const proto = (WINDOW as any)[target] && (WINDOW as any)[target].prototype;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, no-prototype-builtins
    if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
      return;
    }

    fill(proto, 'addEventListener', function (originalAddEventListener: AddEventListener): AddEventListener {
      return function (
        this: Element,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ): AddEventListener {
        if (type === 'click' || type == 'keypress') {
          try {
            const el = this as InstrumentedElement;
            const handlers = (el.__sentry_instrumentation_handlers__ = el.__sentry_instrumentation_handlers__ || {});
            const handlerForType = (handlers[type] = handlers[type] || { refCount: 0 });

            if (!handlerForType.handler) {
              const handler = makeDOMEventHandler(triggerDOMHandler);
              handlerForType.handler = handler;
              originalAddEventListener.call(this, type, handler, options);
            }

            handlerForType.refCount++;
          } catch (e) {
            // Accessing dom properties is always fragile.
            // Also allows us to skip `addEventListenrs` calls with no proper `this` context.
          }
        }

        return originalAddEventListener.call(this, type, listener, options);
      };
    });

    fill(
      proto,
      'removeEventListener',
      function (originalRemoveEventListener: RemoveEventListener): RemoveEventListener {
        return function (
          this: Element,
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | EventListenerOptions,
        ): () => void {
          if (type === 'click' || type == 'keypress') {
            try {
              const el = this as InstrumentedElement;
              const handlers = el.__sentry_instrumentation_handlers__ || {};
              const handlerForType = handlers[type];

              if (handlerForType) {
                handlerForType.refCount--;
                // If there are no longer any custom handlers of the current type on this element, we can remove ours, too.
                if (handlerForType.refCount <= 0) {
                  originalRemoveEventListener.call(this, type, handlerForType.handler, options);
                  handlerForType.handler = undefined;
                  delete handlers[type]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
                }

                // If there are no longer any custom handlers of any type on this element, cleanup everything.
                if (Object.keys(handlers).length === 0) {
                  delete el.__sentry_instrumentation_handlers__;
                }
              }
            } catch (e) {
              // Accessing dom properties is always fragile.
              // Also allows us to skip `addEventListenrs` calls with no proper `this` context.
            }
          }

          return originalRemoveEventListener.call(this, type, listener, options);
        };
      },
    );
  });
}

let _oldOnErrorHandler: OnErrorEventHandler = null;
/** JSDoc */
function instrumentError(): void {
  _oldOnErrorHandler = WINDOW.onerror;

  WINDOW.onerror = function (msg: any, url: any, line: any, column: any, error: any): boolean {
    triggerHandlers('error', {
      column,
      error,
      line,
      msg,
      url,
    });

    if (_oldOnErrorHandler) {
      // eslint-disable-next-line prefer-rest-params
      return _oldOnErrorHandler.apply(this, arguments);
    }

    return false;
  };
}

let _oldOnUnhandledRejectionHandler: ((e: any) => void) | null = null;
/** JSDoc */
function instrumentUnhandledRejection(): void {
  _oldOnUnhandledRejectionHandler = WINDOW.onunhandledrejection;

  WINDOW.onunhandledrejection = function (e: any): boolean {
    triggerHandlers('unhandledrejection', e);

    if (_oldOnUnhandledRejectionHandler) {
      // eslint-disable-next-line prefer-rest-params
      return _oldOnUnhandledRejectionHandler.apply(this, arguments);
    }

    return true;
  };
}
