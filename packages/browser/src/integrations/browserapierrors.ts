import { defineIntegration } from '@sentry/core';
import { fill, getFunctionName, getOriginalFunction } from '@sentry/core';
import type { IntegrationFn, WrappedFunction } from '@sentry/types';

import { WINDOW, wrap } from '../helpers';

const DEFAULT_EVENT_TARGET = [
  'EventTarget',
  'Window',
  'Node',
  'ApplicationCache',
  'AudioTrackList',
  'BroadcastChannel',
  'ChannelMergerNode',
  'CryptoOperation',
  'EventSource',
  'FileReader',
  'HTMLUnknownElement',
  'IDBDatabase',
  'IDBRequest',
  'IDBTransaction',
  'KeyOperation',
  'MediaController',
  'MessagePort',
  'ModalWindow',
  'Notification',
  'SVGElementInstance',
  'Screen',
  'SharedWorker',
  'TextTrack',
  'TextTrackCue',
  'TextTrackList',
  'WebSocket',
  'WebSocketWorker',
  'Worker',
  'XMLHttpRequest',
  'XMLHttpRequestEventTarget',
  'XMLHttpRequestUpload',
];

const INTEGRATION_NAME = 'BrowserApiErrors';

type XMLHttpRequestProp = 'onload' | 'onerror' | 'onprogress' | 'onreadystatechange';

interface BrowserApiErrorsOptions {
  setTimeout: boolean;
  setInterval: boolean;
  requestAnimationFrame: boolean;
  XMLHttpRequest: boolean;
  eventTarget: boolean | string[];
}

const _browserApiErrorsIntegration = ((options: Partial<BrowserApiErrorsOptions> = {}) => {
  const _options = {
    XMLHttpRequest: true,
    eventTarget: true,
    requestAnimationFrame: true,
    setInterval: true,
    setTimeout: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    // TODO: This currently only works for the first client this is setup
    // We may want to adjust this to check for client etc.
    setupOnce() {
      if (_options.setTimeout) {
        fill(WINDOW, 'setTimeout', _wrapTimeFunction);
      }

      if (_options.setInterval) {
        fill(WINDOW, 'setInterval', _wrapTimeFunction);
      }

      if (_options.requestAnimationFrame) {
        fill(WINDOW, 'requestAnimationFrame', _wrapRAF);
      }

      if (_options.XMLHttpRequest && 'XMLHttpRequest' in WINDOW) {
        fill(XMLHttpRequest.prototype, 'send', _wrapXHR);
      }

      const eventTargetOption = _options.eventTarget;
      if (eventTargetOption) {
        const eventTarget = Array.isArray(eventTargetOption) ? eventTargetOption : DEFAULT_EVENT_TARGET;
        eventTarget.forEach(_wrapEventTarget);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Wrap timer functions and event targets to catch errors and provide better meta data.
 */
export const browserApiErrorsIntegration = defineIntegration(_browserApiErrorsIntegration);

function _wrapTimeFunction(original: () => void): () => number {
  return function (this: unknown, ...args: unknown[]): number {
    const originalCallback = args[0];
    args[0] = wrap(originalCallback, {
      mechanism: {
        data: { function: getFunctionName(original) },
        handled: false,
        type: 'instrument',
      },
    });
    return original.apply(this, args);
  };
}

function _wrapRAF(original: () => void): (callback: () => void) => unknown {
  return function (this: unknown, callback: () => void): () => void {
    return original.apply(this, [
      wrap(callback, {
        mechanism: {
          data: {
            function: 'requestAnimationFrame',
            handler: getFunctionName(original),
          },
          handled: false,
          type: 'instrument',
        },
      }),
    ]);
  };
}

function _wrapXHR(originalSend: () => void): () => void {
  return function (this: XMLHttpRequest, ...args: unknown[]): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const xhr = this;
    const xmlHttpRequestProps: XMLHttpRequestProp[] = ['onload', 'onerror', 'onprogress', 'onreadystatechange'];

    xmlHttpRequestProps.forEach(prop => {
      if (prop in xhr && typeof xhr[prop] === 'function') {
        fill(xhr, prop, function (original) {
          const wrapOptions = {
            mechanism: {
              data: {
                function: prop,
                handler: getFunctionName(original),
              },
              handled: false,
              type: 'instrument',
            },
          };

          // If Instrument integration has been called before BrowserApiErrors, get the name of original function
          const originalFunction = getOriginalFunction(original);
          if (originalFunction) {
            wrapOptions.mechanism.data.handler = getFunctionName(originalFunction);
          }

          // Otherwise wrap directly
          return wrap(original, wrapOptions);
        });
      }
    });

    return originalSend.apply(this, args);
  };
}

function _wrapEventTarget(target: string): void {
  const globalObject = WINDOW as unknown as Record<string, { prototype?: object }>;
  const targetObj = globalObject[target];
  const proto = targetObj && targetObj.prototype;

  // eslint-disable-next-line no-prototype-builtins
  if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
    return;
  }

  fill(proto, 'addEventListener', function (original: VoidFunction,): (
    ...args: Parameters<typeof WINDOW.addEventListener>
  ) => ReturnType<typeof WINDOW.addEventListener> {
    return function (this: unknown, eventName, fn, options): VoidFunction {
      try {
        if (isEventListenerObject(fn)) {
          // ESlint disable explanation:
          //  First, it is generally safe to call `wrap` with an unbound function. Furthermore, using `.bind()` would
          //  introduce a bug here, because bind returns a new function that doesn't have our
          //  flags(like __sentry_original__) attached. `wrap` checks for those flags to avoid unnecessary wrapping.
          //  Without those flags, every call to addEventListener wraps the function again, causing a memory leak.
          // eslint-disable-next-line @typescript-eslint/unbound-method
          fn.handleEvent = wrap(fn.handleEvent, {
            mechanism: {
              data: {
                function: 'handleEvent',
                handler: getFunctionName(fn),
                target,
              },
              handled: false,
              type: 'instrument',
            },
          });
        }
      } catch {
        // can sometimes get 'Permission denied to access property "handle Event'
      }

      return original.apply(this, [
        eventName,
        wrap(fn, {
          mechanism: {
            data: {
              function: 'addEventListener',
              handler: getFunctionName(fn),
              target,
            },
            handled: false,
            type: 'instrument',
          },
        }),
        options,
      ]);
    };
  });

  fill(proto, 'removeEventListener', function (originalRemoveEventListener: VoidFunction,): (
    this: unknown,
    ...args: Parameters<typeof WINDOW.removeEventListener>
  ) => ReturnType<typeof WINDOW.removeEventListener> {
    return function (this: unknown, eventName, fn, options): VoidFunction {
      /**
       * There are 2 possible scenarios here:
       *
       * 1. Someone passes a callback, which was attached prior to Sentry initialization, or by using unmodified
       * method, eg. `document.addEventListener.call(el, name, handler). In this case, we treat this function
       * as a pass-through, and call original `removeEventListener` with it.
       *
       * 2. Someone passes a callback, which was attached after Sentry was initialized, which means that it was using
       * our wrapped version of `addEventListener`, which internally calls `wrap` helper.
       * This helper "wraps" whole callback inside a try/catch statement, and attached appropriate metadata to it,
       * in order for us to make a distinction between wrapped/non-wrapped functions possible.
       * If a function was wrapped, it has additional property of `__sentry_wrapped__`, holding the handler.
       *
       * When someone adds a handler prior to initialization, and then do it again, but after,
       * then we have to detach both of them. Otherwise, if we'd detach only wrapped one, it'd be impossible
       * to get rid of the initial handler and it'd stick there forever.
       */
      try {
        const originalEventHandler = (fn as WrappedFunction).__sentry_wrapped__;
        if (originalEventHandler) {
          originalRemoveEventListener.call(this, eventName, originalEventHandler, options);
        }
      } catch (e) {
        // ignore, accessing __sentry_wrapped__ will throw in some Selenium environments
      }
      return originalRemoveEventListener.call(this, eventName, fn, options);
    };
  });
}

function isEventListenerObject(obj: unknown): obj is EventListenerObject {
  return typeof (obj as EventListenerObject).handleEvent === 'function';
}
