import { getDefaultHub } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { isFunction } from '@sentry/utils/is';
import { getGlobalObject, htmlTreeAsString } from '@sentry/utils/misc';
import { fill } from '@sentry/utils/object';

/** TODO */
interface SentryWrappedFunction extends Function {
  [key: string]: any;
  __sentry__?: boolean;
  __sentry_wrapper__?: SentryWrappedFunction;
  __sentry_original__?: SentryWrappedFunction;
}

/** Wrap timer functions and event targets to catch errors and provide better meta data */
export class TryCatch implements Integration {
  /**
   * TODO
   */
  private readonly debounceDuration: number = 1000;

  /**
   * TODO
   */
  private keypressTimeout: number | undefined;

  /**
   * TODO
   */
  private lastCapturedEvent: Event | undefined;

  /**
   * TODO
   */
  private ignoreOnError: number = 0;

  /**
   * @inheritDoc
   */
  public name: string = 'TryCatch';

  /**
   * TODO
   */
  private ignoreNextOnError(): void {
    // onerror should trigger before setTimeout
    this.ignoreOnError += 1;
    setTimeout(() => {
      this.ignoreOnError -= 1;
    });
  }

  /**
   * Wraps addEventListener to capture UI breadcrumbs
   * @param eventName the event name (e.g. "click")
   * @returns wrapped breadcrumb events handler
   */
  private breadcrumbEventHandler(
    this: TryCatch,
    eventName: string,
  ): (event: Event) => void {
    return (event: Event) => {
      // reset keypress timeout; e.g. triggering a 'click' after
      // a 'keypress' will reset the keypress debounce so that a new
      // set of keypresses can be recorded
      this.keypressTimeout = undefined;

      // It's possible this handler might trigger multiple times for the same
      // event (e.g. event propagation through node ancestors). Ignore if we've
      // already captured the event.
      if (this.lastCapturedEvent === event) {
        return;
      }

      this.lastCapturedEvent = event;

      // try/catch both:
      // - accessing event.target (see getsentry/raven-js#838, #768)
      // - `htmlTreeAsString` because it's complex, and just accessing the DOM incorrectly
      //   can throw an exception in some circumstances.
      let target;
      try {
        target = htmlTreeAsString(event.target as Node);
      } catch (e) {
        target = '<unknown>';
      }

      getDefaultHub().addBreadcrumb({
        category: `ui.${eventName}`, // e.g. ui.click, ui.input
        message: target,
      });
    };
  }

  /**
   * Wraps addEventListener to capture keypress UI events
   * @returns wrapped keypress events handler
   */
  private keypressEventHandler(this: TryCatch): (event: Event) => void {
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
      if (
        !tagName ||
        (tagName !== 'INPUT' &&
          tagName !== 'TEXTAREA' &&
          !(target as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // record first keypress in a series, but ignore subsequent
      // keypresses until debounce clears
      if (!this.keypressTimeout) {
        this.breadcrumbEventHandler('input')(event);
      }
      clearTimeout(this.keypressTimeout as number);

      this.keypressTimeout = (setTimeout(() => {
        this.keypressTimeout = undefined;
      }, this.debounceDuration) as any) as number;
    };
  }

  /**
   * Instruments the given function and sends an event to Sentry every time the
   * function throws an exception.
   *
   * @param fn A function to wrap.
   * @returns The wrapped function.
   */
  private wrap(
    this: TryCatch,
    fn: SentryWrappedFunction,
    options?: {
      mechanism?: object;
    },
    before?: SentryWrappedFunction,
  ): any {
    try {
      // We don't wanna wrap it twice
      if (fn.__sentry__) {
        return fn;
      }
      // If this has already been wrapped in the past, return that wrapped function
      if (fn.__sentry_wrapper__) {
        return fn.__sentry_wrapper__;
      }
    } catch (e) {
      // Just accessing custom props in some Selenium environments
      // can cause a "Permission denied" exception (see raven-js#495).
      // Bail on wrapping and return the function as-is (defers to window.onerror).
      return fn;
    }

    const wrapped: SentryWrappedFunction = (...args: any[]) => {
      if (before && isFunction(before)) {
        before.apply(this, args);
      }

      try {
        // Attempt to invoke user-land function
        // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
        //       means Raven caught an error invoking your application code. This is
        //       expected behavior and NOT indicative of a bug with Raven.js.
        return fn.apply(this, args);
      } catch (ex) {
        this.ignoreNextOnError();

        getDefaultHub().withScope(async () => {
          getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
            ...event,
            ...(options && options.mechanism),
          }));

          getDefaultHub().captureException(ex);
        });

        throw ex;
      }
    };

    for (const property in fn) {
      if (Object.prototype.hasOwnProperty.call(fn, property)) {
        wrapped[property] = fn[property];
      }
    }

    wrapped.prototype = fn.prototype;
    fn.__sentry_wrapper__ = wrapped;

    // Signal that this function has been wrapped/filled already
    // for both debugging and to prevent it to being wrapped/filled twice
    wrapped.__sentry__ = true;
    wrapped.__sentry_original__ = fn;

    return wrapped;
  }

  /**
   * TODO
   */
  private wrapTimeFunction(original: () => void): () => number {
    return (...args: any[]): number => {
      const originalCallback = args[0];
      args[0] = this.wrap(originalCallback, {
        mechanism: {
          data: { function: original.name || '<anonymous>' },
          type: 'instrument',
        },
      });
      return original.apply(this, args);
    };
  }

  /**
   * TODO
   */
  private wrapRAF(original: any): (callback: () => void) => any {
    return (callback: () => void) =>
      original(
        this.wrap(callback, {
          mechanism: {
            data: {
              function: 'requestAnimationFrame',
              handler: (original && original.name) || '<anonymous>',
            },
            type: 'instrument',
          },
        }),
      );
  }

  /**
   * TODO
   */
  private wrapEventTarget(target: string): void {
    const global = getGlobalObject() as { [key: string]: any };
    const proto = global[target] && global[target].prototype;

    if (
      !proto ||
      !proto.hasOwnProperty ||
      !proto.hasOwnProperty('addEventListener')
    ) {
      return;
    }

    fill(
      proto,
      'addEventListener',
      (
        original: () => void,
      ): ((
        eventName: string,
        fn: EventListenerObject,
        capture?: boolean,
        secure?: boolean,
      ) => any) => (
        eventName: string,
        fn: EventListenerObject,
        capture?: boolean,
        secure?: boolean,
      ): any => {
        try {
          fn.handleEvent = this.wrap(fn.handleEvent.bind(fn), {
            mechanism: {
              data: {
                function: 'handleEvent',
                handler:
                  ((fn as any) as SentryWrappedFunction).name || '<anonymous>',
                target,
              },
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
          clickHandler = this.breadcrumbEventHandler('click');
          keypressHandler = this.keypressEventHandler();
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
          this.wrap(
            (fn as any) as SentryWrappedFunction,
            {
              mechanism: {
                data: {
                  function: 'addEventListener',
                  handler:
                    ((fn as any) as SentryWrappedFunction).name ||
                    '<anonymous>',
                  target,
                },
                type: 'instrument',
              },
            },
            before,
          ),
          capture,
          secure,
        );
      },
    );

    fill(proto, 'removeEventListener', function(
      original: () => void,
    ): (
      this: any,
      eventName: string,
      fn: EventListenerObject,
      capture?: boolean,
      secure?: boolean,
    ) => () => void {
      return function(
        this: any,
        eventName: string,
        fn: EventListenerObject,
        capture?: boolean,
        secure?: boolean,
      ): () => void {
        let callback = (fn as any) as SentryWrappedFunction;
        try {
          callback = callback && (callback.__sentry_wrapper__ || callback);
        } catch (e) {
          // ignore, accessing __sentry_wrapper__ will throw in some Selenium environments
        }
        return original.call(this, eventName, callback, capture, secure);
      };
    });
  }

  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  public install(): void {
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
