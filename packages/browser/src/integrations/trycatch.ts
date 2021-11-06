import { Integration, WrappedFunction } from '@sentry/types';
import { fill, getFunctionName, getGlobalObject } from '@sentry/utils';

import { wrap } from '../helpers';

const DEFAULT_EVENT_TARGET = [
  'EventTarget',
  'Window',
  'Node',
  'ApplicationCache',
  'AudioTrackList',
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

type XMLHttpRequestProp = 'onload' | 'onerror' | 'onprogress' | 'onreadystatechange';

/** JSDoc */
interface TryCatchOptions {
  setTimeout: boolean;
  setInterval: boolean;
  requestAnimationFrame: boolean;
  XMLHttpRequest: boolean;
  eventTarget: boolean | string[];
}

/** Wrap timer functions and event targets to catch errors and provide better meta data */
export class TryCatch implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'TryCatch';

  /**
   * @inheritDoc
   */
  public name: string = TryCatch.id;

  /** JSDoc */
  private readonly _options: TryCatchOptions;

  /**
   * @inheritDoc
   */
  public constructor(options?: Partial<TryCatchOptions>) {
    this._options = {
      XMLHttpRequest: true,
      eventTarget: true,
      requestAnimationFrame: true,
      setInterval: true,
      setTimeout: true,
      ...options,
    };
  }

  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  public setupOnce(): void {
    const global = getGlobalObject();

    if (this._options.setTimeout) {
      fill(global, 'setTimeout', this._wrapTimeFunction.bind(this));
    }

    if (this._options.setInterval) {
      fill(global, 'setInterval', this._wrapTimeFunction.bind(this));
    }

    if (this._options.requestAnimationFrame) {
      fill(global, 'requestAnimationFrame', this._wrapRAF.bind(this));
    }

    if (this._options.XMLHttpRequest && 'XMLHttpRequest' in global) {
      fill(XMLHttpRequest.prototype, 'send', this._wrapXHR.bind(this));
    }

    if (this._options.eventTarget) {
      const eventTarget = Array.isArray(this._options.eventTarget) ? this._options.eventTarget : DEFAULT_EVENT_TARGET;
      eventTarget.forEach(this._wrapEventTarget.bind(this));
    }
  }

  /** JSDoc */
  private _wrapTimeFunction(original: () => void): () => number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(this: any, ...args: any[]): number {
      const originalCallback = args[0];
      args[0] = wrap(originalCallback, {
        mechanism: {
          data: { function: getFunctionName(original) },
          handled: true,
          type: 'instrument',
        },
      });
      return original.apply(this, args);
    };
  }

  /** JSDoc */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _wrapRAF(original: any): (callback: () => void) => any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(this: any, callback: () => void): () => void {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return original.call(
        this,
        wrap(callback, {
          mechanism: {
            data: {
              function: 'requestAnimationFrame',
              handler: getFunctionName(original),
            },
            handled: true,
            type: 'instrument',
          },
        }),
      );
    };
  }

  /** JSDoc */
  private _wrapEventTarget(target: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const global = getGlobalObject() as { [key: string]: any };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const proto = global[target] && global[target].prototype;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, no-prototype-builtins
    if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
      return;
    }

    fill(proto, 'addEventListener', function(
      original: () => void,
    ): (eventName: string, fn: EventListenerObject, options?: boolean | AddEventListenerOptions) => void {
      return function(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: any,
        eventName: string,
        fn: EventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ): (eventName: string, fn: EventListenerObject, capture?: boolean, secure?: boolean) => void {
        try {
          if (typeof fn.handleEvent === 'function') {
            fn.handleEvent = wrap(fn.handleEvent.bind(fn), {
              mechanism: {
                data: {
                  function: 'handleEvent',
                  handler: getFunctionName(fn),
                  target,
                },
                handled: true,
                type: 'instrument',
              },
            });
          }
        } catch (err) {
          // can sometimes get 'Permission denied to access property "handle Event'
        }

        return original.call(
          this,
          eventName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wrap((fn as any) as WrappedFunction, {
            mechanism: {
              data: {
                function: 'addEventListener',
                handler: getFunctionName(fn),
                target,
              },
              handled: true,
              type: 'instrument',
            },
          }),
          options,
        );
      };
    });

    fill(proto, 'removeEventListener', function(
      originalRemoveEventListener: () => void,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): (this: any, eventName: string, fn: EventListenerObject, options?: boolean | EventListenerOptions) => () => void {
      return function(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: any,
        eventName: string,
        fn: EventListenerObject,
        options?: boolean | EventListenerOptions,
      ): () => void {
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
        const wrappedEventHandler = (fn as unknown) as WrappedFunction;
        try {
          const originalEventHandler = wrappedEventHandler?.__sentry_wrapped__;
          if (originalEventHandler) {
            originalRemoveEventListener.call(this, eventName, originalEventHandler, options);
          }
        } catch (e) {
          // ignore, accessing __sentry_wrapped__ will throw in some Selenium environments
        }
        return originalRemoveEventListener.call(this, eventName, wrappedEventHandler, options);
      };
    });
  }

  /** JSDoc */
  private _wrapXHR(originalSend: () => void): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(this: XMLHttpRequest, ...args: any[]): void {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhr = this;
      const xmlHttpRequestProps: XMLHttpRequestProp[] = ['onload', 'onerror', 'onprogress', 'onreadystatechange'];

      xmlHttpRequestProps.forEach(prop => {
        if (prop in xhr && typeof xhr[prop] === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fill(xhr, prop, function(original: WrappedFunction): () => any {
            const wrapOptions = {
              mechanism: {
                data: {
                  function: prop,
                  handler: getFunctionName(original),
                },
                handled: true,
                type: 'instrument',
              },
            };

            // If Instrument integration has been called before TryCatch, get the name of original function
            if (original.__sentry_original__) {
              wrapOptions.mechanism.data.handler = getFunctionName(original.__sentry_original__);
            }

            // Otherwise wrap directly
            return wrap(original, wrapOptions);
          });
        }
      });

      return originalSend.apply(this, args);
    };
  }
}
