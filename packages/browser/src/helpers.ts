import { API, captureException, withScope } from '@sentry/core';
import { DsnLike, Event as SentryEvent, Mechanism, Scope, WrappedFunction } from '@sentry/types';
import { addExceptionMechanism, addExceptionTypeValue, logger } from '@sentry/utils';

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
    const args = Array.prototype.slice.call(arguments);

    // tslint:disable:no-unsafe-any
    try {
      // tslint:disable-next-line:strict-type-predicates
      if (before && typeof before === 'function') {
        before.apply(this, arguments);
      }

      const wrappedArguments = args.map((arg: any) => wrap(arg, options));

      if (fn.handleEvent) {
        // Attempt to invoke user-land function
        // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
        //       means the sentry.javascript SDK caught an error invoking your application code. This
        //       is expected behavior and NOT indicative of a bug with sentry.javascript.
        return fn.handleEvent.apply(this, wrappedArguments);
      }
      // Attempt to invoke user-land function
      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
      //       means the sentry.javascript SDK caught an error invoking your application code. This
      //       is expected behavior and NOT indicative of a bug with sentry.javascript.
      return fn.apply(this, wrappedArguments);
      // tslint:enable:no-unsafe-any
    } catch (ex) {
      ignoreNextOnError();

      withScope((scope: Scope) => {
        scope.addEventProcessor((event: SentryEvent) => {
          const processedEvent = { ...event };

          if (options.mechanism) {
            addExceptionTypeValue(processedEvent, undefined, undefined);
            addExceptionMechanism(processedEvent, options.mechanism);
          }

          processedEvent.extra = {
            ...processedEvent.extra,
            arguments: args,
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
    const descriptor = Object.getOwnPropertyDescriptor(sentryWrapped, 'name') as PropertyDescriptor;
    if (descriptor.configurable) {
      Object.defineProperty(sentryWrapped, 'name', {
        get(): string {
          return fn.name;
        },
      });
    }
  } catch (_oO) {
    /*no-empty*/
  }

  return sentryWrapped;
}

/**
 * All properties the report dialog supports
 */
export interface ReportDialogOptions {
  [key: string]: any;
  eventId?: string;
  dsn?: DsnLike;
  user?: {
    email?: string;
    name?: string;
  };
  lang?: string;
  title?: string;
  subtitle?: string;
  subtitle2?: string;
  labelName?: string;
  labelEmail?: string;
  labelComments?: string;
  labelClose?: string;
  labelSubmit?: string;
  errorGeneric?: string;
  errorFormEntry?: string;
  successMessage?: string;
  /** Callback after reportDialog showed up */
  onLoad?(): void;
}

/**
 * Injects the Report Dialog script
 * @hidden
 */
export function injectReportDialog(options: ReportDialogOptions = {}): void {
  if (!options.eventId) {
    logger.error(`Missing eventId option in showReportDialog call`);
    return;
  }
  if (!options.dsn) {
    logger.error(`Missing dsn option in showReportDialog call`);
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = new API(options.dsn).getReportDialogEndpoint(options);

  if (options.onLoad) {
    script.onload = options.onLoad;
  }

  (document.head || document.body).appendChild(script);
}
