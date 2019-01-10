import { Integration, SentryWrappedFunction } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { fill } from '@sentry/utils/object';
import { breadcrumbEventHandler, keypressEventHandler, wrap } from './helpers';

/** Wrap timer functions and event targets to catch errors and provide better meta data */
export class TryCatch implements Integration {
  /** JSDoc */
  private ignoreOnError: number = 0;

  /**
   * @inheritDoc
   */
  public name: string = TryCatch.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'TryCatch';

  /** JSDoc */
  private wrapTimeFunction(original: () => void): () => number {
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
  private wrapRAF(original: any): (callback: () => void) => any {
    return function(this: any, callback: () => void): () => void {
      return original(
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
  private wrapEventTarget(target: string): void {
    const global = getGlobalObject() as { [key: string]: any };
    const proto = global[target] && global[target].prototype;

    if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty('addEventListener')) {
      return;
    }

    fill(proto, 'addEventListener', function(
      original: () => void,
    ): (eventName: string, fn: EventListenerObject, options?: boolean | AddEventListenerOptions) => void {
      return function(
        this: any,
        eventName: string,
        fn: EventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ): (eventName: string, fn: EventListenerObject, capture?: boolean, secure?: boolean) => void {
        try {
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
        } catch (err) {
          // can sometimes get 'Permission denied to access property "handle Event'
        }

        // More breadcrumb DOM capture ... done here and not in `_instrumentBreadcrumbs`
        // so that we don't have more than one wrapper function
        let before: any;
        let clickHandler: any;
        let keypressHandler: any;

        if (target === 'EventTarget' || target === 'Node') {
          // NOTE: generating multiple handlers per addEventListener invocation, should
          //       revisit and verify we can just use one (almost certainly)
          clickHandler = breadcrumbEventHandler('click');
          keypressHandler = keypressEventHandler();
          before = function(event: Event): any {
            // need to intercept every DOM event in `before` argument, in case that
            // same wrapped method is re-used for different events (e.g. mousemove THEN click)
            // see #724
            if (!event) {
              return;
            }

            let eventType;
            try {
              eventType = event.type;
            } catch (e) {
              // just accessing event properties can throw an exception in some rare circumstances
              // see: https://github.com/getsentry/raven-js/issues/838
              return;
            }
            if (eventType === 'click') {
              return clickHandler(event);
            } else if (eventType === 'keypress') {
              return keypressHandler(event);
            }
          };
        }

        return original.call(
          this,
          eventName,
          wrap(
            (fn as any) as SentryWrappedFunction,
            {
              mechanism: {
                data: {
                  function: 'addEventListener',
                  handler: getFunctionName(fn),
                  target,
                },
                handled: true,
                type: 'instrument',
              },
            },
            before,
          ),
          options,
        );
      };
    });

    fill(proto, 'removeEventListener', function(
      original: () => void,
    ): (this: any, eventName: string, fn: EventListenerObject, options?: boolean | EventListenerOptions) => () => void {
      return function(
        this: any,
        eventName: string,
        fn: EventListenerObject,
        options?: boolean | EventListenerOptions,
      ): () => void {
        let callback = (fn as any) as SentryWrappedFunction;
        try {
          callback = callback && (callback.__sentry_wrapped__ || callback);
        } catch (e) {
          // ignore, accessing __sentry_wrapped__ will throw in some Selenium environments
        }
        return original.call(this, eventName, callback, options);
      };
    });
  }

  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  public setupOnce(): void {
    this.ignoreOnError = this.ignoreOnError;

    const global = getGlobalObject();

    fill(global, 'setTimeout', this.wrapTimeFunction.bind(this));
    fill(global, 'setInterval', this.wrapTimeFunction.bind(this));
    fill(global, 'requestAnimationFrame', this.wrapRAF.bind(this));

    [
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
    ].forEach(this.wrapEventTarget.bind(this));
  }
}

/**
 * Safely extract function name from itself
 */
function getFunctionName(fn: any): string {
  try {
    return (fn && fn.name) || '<anonymous>';
  } catch (e) {
    // Just accessing custom props in some Selenium environments
    // can cause a "Permission denied" exception (see raven-js#495).
    return '<anonymous>';
  }
}
