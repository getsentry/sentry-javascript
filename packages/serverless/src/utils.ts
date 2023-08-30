import { runWithAsyncContext } from '@sentry/core';
import type { Event } from '@sentry/node';
import { Scope } from '@sentry/types';
import { addExceptionMechanism } from '@sentry/utils';

/**
 * Event processor that will override SDK details to point to the serverless SDK instead of Node,
 * as well as set correct mechanism type, which should be set to `handled: false`.
 * We do it like this so that we don't introduce any side-effects in this module, which makes it tree-shakeable.
 * @param event Event
 * @param integration Name of the serverless integration ('AWSLambda', 'GCPFunction', etc)
 */
export function serverlessEventProcessor(event: Event): Event {
  addExceptionMechanism(event, {
    handled: false,
  });

  return event;
}

/**
 * @param fn function to run
 * @returns function which runs in the newly created domain or in the existing one
 */
export function domainify<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R | void {
  return (...args) => runWithAsyncContext(() => fn(...args), { reuseExisting: true });
}

/**
 * @param source function to be wrapped
 * @param wrap wrapping function that takes source and returns a wrapper
 * @param overrides properties to override in the source
 * @returns wrapped function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proxyFunction<A extends any[], R, F extends (...args: A) => R>(
  source: F,
  wrap: (source: F) => F,
  overrides?: Record<PropertyKey, unknown>,
): F {
  const wrapper = wrap(source);
  const handler: ProxyHandler<F> = {
    apply: <T>(_target: F, thisArg: T, args: A) => {
      return wrapper.apply(thisArg, args);
    },
  };

  if (overrides) {
    handler.get = (target, prop) => {
      if (Object.prototype.hasOwnProperty.call(overrides, prop)) {
        return overrides[prop as string];
      }
      return (target as Record<PropertyKey, unknown>)[prop as string];
    };
  }

  return new Proxy(source, handler);
}

/**
 * Marks an event as unhandled by adding a span processor to the passed scope.
 */
export function markEventUnhandled(scope: Scope): Scope {
  scope.addEventProcessor(event => {
    addExceptionMechanism(event, { handled: false });
    return event;
  });

  return scope;
}
