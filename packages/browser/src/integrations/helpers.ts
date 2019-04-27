import { captureException, getCurrentHub, withScope } from '@sentry/core';
import { Event as SentryEvent, Mechanism, WrappedFunction } from '@sentry/types';
import { addExceptionTypeValue, isString, normalize } from '@sentry/utils';

const debounceDuration: number = 1000;
let keypressTimeout: number | undefined;
let lastCapturedEvent: Event | undefined;
let ignoreOnError: number = 0;

/**
 * @hidden
 */
export function shouldIgnoreOnError(): boolean {
  return ignoreOnError > 0;
}

/**
 * @hidden
 */
export function ignoreNextOnError(): void {
  // onerror should trigger before setTimeout
  ignoreOnError += 1;
  setTimeout(() => {
    ignoreOnError -= 1;
  });
}

/**
 * Instruments the given function and sends an event to Sentry every time the
 * function throws an exception.
 *
 * @param fn A function to wrap.
 * @returns The wrapped function.
 * @hidden
 */
export function wrap(
  fn: WrappedFunction,
  options: {
    mechanism?: Mechanism;
    capture?: boolean;
  } = {},
  before?: WrappedFunction,
): any {
  // tslint:disable-next-line:strict-type-predicates
  if (typeof fn !== 'function') {
    return fn;
  }

  try {
    // We don't wanna wrap it twice
    if (fn.__sentry__) {
      return fn;
    }

    // If this has already been wrapped in the past, return that wrapped function
    if (fn.__sentry_wrapped__) {
      return fn.__sentry_wrapped__;
    }
  } catch (e) {
    // Just accessing custom props in some Selenium environments
    // can cause a "Permission denied" exception (see raven-js#495).
    // Bail on wrapping and return the function as-is (defers to window.onerror).
    return fn;
  }

  const sentryWrapped: WrappedFunction = function(this: any): void {
    // tslint:disable-next-line:strict-type-predicates
    if (before && typeof before === 'function') {
      before.apply(this, arguments);
    }

    const args = Array.prototype.slice.call(arguments);

    try {
      // Attempt to invoke user-land function
      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
      //       means Raven caught an error invoking your application code. This is
      //       expected behavior and NOT indicative of a bug with Raven.js.
      const wrappedArguments = args.map((arg: any) => wrap(arg, options));

      if (fn.handleEvent) {
        return fn.handleEvent.apply(this, wrappedArguments);
      }
      return fn.apply(this, wrappedArguments);
    } catch (ex) {
      ignoreNextOnError();

      withScope(scope => {
        scope.addEventProcessor((event: SentryEvent) => {
          const processedEvent = { ...event };

          if (options.mechanism) {
            addExceptionTypeValue(processedEvent, undefined, undefined, options.mechanism);
          }

          processedEvent.extra = {
            ...processedEvent.extra,
            arguments: normalize(args, 3),
          };

          return processedEvent;
        });

        captureException(ex);
      });

      throw ex;
    }
  };

  // Accessing some objects may throw
  // ref: https://github.com/getsentry/sentry-javascript/issues/1168
  try {
    for (const property in fn) {
      if (Object.prototype.hasOwnProperty.call(fn, property)) {
        sentryWrapped[property] = fn[property];
      }
    }
  } catch (_oO) {} // tslint:disable-line:no-empty

  fn.prototype = fn.prototype || {};
  sentryWrapped.prototype = fn.prototype;

  Object.defineProperty(fn, '__sentry_wrapped__', {
    enumerable: false,
    value: sentryWrapped,
  });

  // Signal that this function has been wrapped/filled already
  // for both debugging and to prevent it to being wrapped/filled twice
  Object.defineProperties(sentryWrapped, {
    __sentry__: {
      enumerable: false,
      value: true,
    },
    __sentry_original__: {
      enumerable: false,
      value: fn,
    },
  });

  // Restore original function name (not all browsers allow that)
  try {
    Object.defineProperty(sentryWrapped, 'name', {
      get(): string {
        return fn.name;
      },
    });
  } catch (_oO) {
    /*no-empty*/
  }

  return sentryWrapped;
}

let debounceTimer: number = 0;

/**
 * Wraps addEventListener to capture UI breadcrumbs
 * @param eventName the event name (e.g. "click")
 * @returns wrapped breadcrumb events handler
 * @hidden
 */
export function breadcrumbEventHandler(eventName: string, debounce: boolean = false): (event: Event) => void {
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

    const captureBreadcrumb = () => {
      // try/catch both:
      // - accessing event.target (see getsentry/raven-js#838, #768)
      // - `htmlTreeAsString` because it's complex, and just accessing the DOM incorrectly
      //   can throw an exception in some circumstances.
      let target;
      try {
        target = event.target ? _htmlTreeAsString(event.target as Node) : _htmlTreeAsString((event as unknown) as Node);
      } catch (e) {
        target = '<unknown>';
      }

      if (target.length === 0) {
        return;
      }

      getCurrentHub().addBreadcrumb(
        {
          category: `ui.${eventName}`, // e.g. ui.click, ui.input
          message: target,
        },
        {
          event,
          name: eventName,
        },
      );
    };

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (debounce) {
      debounceTimer = setTimeout(captureBreadcrumb);
    } else {
      captureBreadcrumb();
    }
  };
}

/**
 * Wraps addEventListener to capture keypress UI events
 * @returns wrapped keypress events handler
 * @hidden
 */
export function keypressEventHandler(): (event: Event) => void {
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
      breadcrumbEventHandler('input')(event);
    }
    clearTimeout(keypressTimeout);

    keypressTimeout = (setTimeout(() => {
      keypressTimeout = undefined;
    }, debounceDuration) as any) as number;
  };
}

/**
 * Given a child DOM element, returns a query-selector statement describing that
 * and its ancestors
 * e.g. [HTMLElement] => body > div > input#foo.btn[name=baz]
 * @returns generated DOM path
 */
function _htmlTreeAsString(elem: Node): string {
  let currentElem: Node | null = elem;
  const MAX_TRAVERSE_HEIGHT = 5;
  const MAX_OUTPUT_LEN = 80;
  const out = [];
  let height = 0;
  let len = 0;
  const separator = ' > ';
  const sepLength = separator.length;
  let nextStr;

  while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
    nextStr = _htmlElementAsString(currentElem as HTMLElement);
    // bail out if
    // - nextStr is the 'html' element
    // - the length of the string that would be created exceeds MAX_OUTPUT_LEN
    //   (ignore this limit if we are on the first iteration)
    if (nextStr === 'html' || (height > 1 && len + out.length * sepLength + nextStr.length >= MAX_OUTPUT_LEN)) {
      break;
    }

    out.push(nextStr);

    len += nextStr.length;
    currentElem = currentElem.parentNode;
  }

  return out.reverse().join(separator);
}

/**
 * Returns a simple, query-selector representation of a DOM element
 * e.g. [HTMLElement] => input#foo.btn[name=baz]
 * @returns generated DOM path
 */
function _htmlElementAsString(elem: HTMLElement): string {
  const out = [];
  let className;
  let classes;
  let key;
  let attr;
  let i;

  if (!elem || !elem.tagName) {
    return '';
  }

  out.push(elem.tagName.toLowerCase());
  if (elem.id) {
    out.push(`#${elem.id}`);
  }

  className = elem.className;
  if (className && isString(className)) {
    classes = className.split(/\s+/);
    for (i = 0; i < classes.length; i++) {
      out.push(`.${classes[i]}`);
    }
  }
  const attrWhitelist = ['type', 'name', 'title', 'alt'];
  for (i = 0; i < attrWhitelist.length; i++) {
    key = attrWhitelist[i];
    attr = elem.getAttribute(key);
    if (attr) {
      out.push(`[${key}="${attr}"]`);
    }
  }
  return out.join('');
}
