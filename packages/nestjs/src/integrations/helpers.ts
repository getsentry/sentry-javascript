import type { Span } from '@sentry/core';
import {
  addNonEnumerableProperty,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  withActiveSpan,
} from '@sentry/core';
import type { CatchTarget, InjectableTarget, NextFunction, Observable, Subscription } from './types';

const sentryPatched = 'sentryPatched';

/**
 * Helper checking if a concrete target class is already patched.
 *
 * We already guard duplicate patching with isWrapped. However, isWrapped checks whether a file has been patched, whereas we use this check for concrete target classes.
 * This check might not be necessary, but better to play it safe.
 */
export function isPatched(target: InjectableTarget | CatchTarget): boolean {
  if (target.sentryPatched) {
    return true;
  }

  addNonEnumerableProperty(target, sentryPatched, true);
  return false;
}

/**
 * Returns span options for nest middleware spans.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getMiddlewareSpanOptions(target: InjectableTarget | CatchTarget, name: string | undefined = undefined) {
  const span_name = name ?? target.name; // fallback to class name if no name is provided

  return {
    name: span_name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nestjs',
    },
  };
}

/**
 * Returns span options for nest event spans.
 */
export function getEventSpanOptions(event: string): {
  name: string;
  attributes: Record<string, string>;
  forceTransaction: boolean;
} {
  return {
    name: `event ${event}`,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'event.nestjs',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.event.nestjs',
    },
    forceTransaction: true,
  };
}

/**
 * Adds instrumentation to a js observable and attaches the span to an active parent span.
 */
export function instrumentObservable(observable: Observable<unknown>, activeSpan: Span | undefined): void {
  if (activeSpan) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    observable.subscribe = new Proxy(observable.subscribe, {
      apply: (originalSubscribe, thisArgSubscribe, argsSubscribe) => {
        return withActiveSpan(activeSpan, () => {
          const subscription: Subscription = originalSubscribe.apply(thisArgSubscribe, argsSubscribe);
          subscription.add(() => activeSpan.end());
          return subscription;
        });
      },
    });
  }
}

/**
 * Proxies the next() call in a nestjs middleware to end the span when it is called.
 */
export function getNextProxy(next: NextFunction, span: Span, prevSpan: undefined | Span): NextFunction {
  return new Proxy(next, {
    apply: (originalNext, thisArgNext, argsNext) => {
      span.end();

      if (prevSpan) {
        return withActiveSpan(prevSpan, () => {
          return Reflect.apply(originalNext, thisArgNext, argsNext);
        });
      } else {
        return Reflect.apply(originalNext, thisArgNext, argsNext);
      }
    },
  });
}
