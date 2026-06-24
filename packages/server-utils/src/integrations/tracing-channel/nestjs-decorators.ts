import type { Span, SpanAttributes } from '@sentry/core';
import {
  addNonEnumerableProperty,
  getActiveSpan,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';

/**
 * A function of unknown signature.
 */
export type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

const OP_MIDDLEWARE = 'middleware.nestjs';
const ORIGIN_MIDDLEWARE = 'auto.middleware.nestjs';

/** The class an `@Injectable` decorator is applied to (`ctx.arguments[0]`). */
export interface InjectableTarget {
  name?: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
  prototype: {
    use?: AnyFn;
    canActivate?: AnyFn;
    transform?: AnyFn;
    intercept?: AnyFn;
  };
}

/** The class a `@Catch` decorator is applied to (an exception filter). */
export interface CatchTarget {
  name?: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
  prototype: { catch?: AnyFn };
}

interface NestCallHandler {
  handle: AnyFn;
}

interface SubscriptionLike {
  add: (teardown: () => void) => void;
}

interface ObservableLike {
  subscribe: AnyFn;
}

/**
 * Mark a target class as patched so it's instrumented only once (mirrors the
 * vendored `isPatched`). Also give idempotency across repeated subscriptions.
 */
function isTargetPatched(target: { sentryPatched?: boolean }): boolean {
  if (target.sentryPatched) {
    return true;
  }
  addNonEnumerableProperty(target as object, 'sentryPatched', true);
  return false;
}

/**
 * Span options for middleware/guard/pipe/interceptor spans
 * name = provided name or class name.
 */
function getMiddlewareSpanOptions(
  target: { name?: string },
  name?: string,
  componentType?: string,
): { name: string; attributes: SpanAttributes } {
  return {
    name: name ?? target.name ?? 'unknown',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: OP_MIDDLEWARE,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: componentType ? `${ORIGIN_MIDDLEWARE}.${componentType}` : ORIGIN_MIDDLEWARE,
    },
  };
}

/**
 * Proxy a middleware `next()` so the span ends when `next` is called, then
 * restore the previous active span for the continuation.
 */
function getNextProxy(next: AnyFn, span: Span, prevSpan: Span | undefined): AnyFn {
  return new Proxy(next, {
    apply: (originalNext, thisArgNext, argsNext) => {
      span.end();
      if (prevSpan) {
        return withActiveSpan(prevSpan, () => Reflect.apply(originalNext, thisArgNext, argsNext));
      }
      return Reflect.apply(originalNext, thisArgNext, argsNext);
    },
  });
}

/**
 * End the given span when the interceptor's returned observable is
 * unsubscribed (i.e. the response is sent), keeping it active across the
 * subscription.
 */
function instrumentObservable(observable: ObservableLike, activeSpan: Span | undefined): void {
  if (!activeSpan) {
    return;
  }
  observable.subscribe = new Proxy(observable.subscribe, {
    apply: (originalSubscribe, thisArgSubscribe, argsSubscribe) => {
      return withActiveSpan(activeSpan, () => {
        const subscription = originalSubscribe.apply(thisArgSubscribe, argsSubscribe) as SubscriptionLike;
        subscription.add(() => activeSpan.end());
        return subscription;
      });
    },
  });
}

function patchInterceptor(target: InjectableTarget, intercept: AnyFn, seenContexts: WeakSet<object>): AnyFn {
  return new Proxy(intercept, {
    apply: (originalIntercept, thisArg, argsIntercept) => {
      const context = argsIntercept[0] as object | undefined;
      const next = argsIntercept[1] as NestCallHandler | undefined;
      const parentSpan = getActiveSpan();
      let afterSpan: Span | undefined;

      if (
        !context ||
        !next ||
        typeof next.handle !== 'function' ||
        target.name === 'SentryTracingInterceptor' // don't trace Sentry's own interceptor
      ) {
        return originalIntercept.apply(thisArg, argsIntercept);
      }

      return startSpanManual(getMiddlewareSpanOptions(target, undefined, 'interceptor'), (beforeSpan: Span) => {
        // `next.handle()` is the boundary between the "before" and "after"
        // interceptor work: end the before-span and open the after-span (once
        // per execution context), which `instrumentObservable` later closes.
        next.handle = new Proxy(next.handle, {
          apply: (originalHandle, thisArgHandle, argsHandle) => {
            beforeSpan.end();
            const run = (): unknown => {
              const handleReturn = Reflect.apply(originalHandle, thisArgHandle, argsHandle);
              if (!seenContexts.has(context)) {
                seenContexts.add(context);
                afterSpan = startInactiveSpan(
                  getMiddlewareSpanOptions(target, 'Interceptors - After Route', 'interceptor'),
                );
              }
              return handleReturn;
            };
            return parentSpan ? withActiveSpan(parentSpan, run) : run();
          },
        });

        let returned: unknown;
        try {
          returned = originalIntercept.apply(thisArg, argsIntercept);
        } catch (e) {
          beforeSpan.end();
          afterSpan?.end();
          throw e;
        }

        if (!afterSpan) {
          return returned;
        }

        // async interceptor: returns a Promise<Observable>
        if (isThenable(returned)) {
          return returned.then(
            (observable: unknown) => {
              instrumentObservable(observable as ObservableLike, afterSpan ?? parentSpan);
              return observable;
            },
            (e: unknown) => {
              beforeSpan.end();
              afterSpan?.end();
              throw e;
            },
          );
        }

        // sync interceptor: returns an Observable
        if (typeof (returned as ObservableLike).subscribe === 'function') {
          instrumentObservable(returned as ObservableLike, afterSpan);
        }

        return returned;
      });
    },
  });
}

/**
 * Port the vendored `@Injectable` instrumentation
 * patch the decorated class's prototype methods so each runtime
 * invocation opens the corresponding middleware/guard/pipe/interceptor span.
 * The runtime guards (req/res/next, context, value+metadata) avoid false
 * positives on non-middleware classes that happen to expose a same-named
 * method.
 */
export function patchInjectableTarget(target: InjectableTarget, seenContexts: WeakSet<object>): void {
  const proto = target?.prototype;
  if (!proto || target.__SENTRY_INTERNAL__ || isTargetPatched(target)) {
    return;
  }

  // middleware
  if (typeof proto.use === 'function') {
    proto.use = new Proxy(proto.use, {
      apply: (originalUse, thisArgUse, argsUse) => {
        const [req, res, next] = argsUse as unknown[];
        if (!req || !res || !next || typeof next !== 'function') {
          return originalUse.apply(thisArgUse, argsUse);
        }
        const prevSpan = getActiveSpan();
        return startSpanManual(getMiddlewareSpanOptions(target), (span: Span) => {
          const nextProxy = getNextProxy(next as AnyFn, span, prevSpan);
          const rest = (argsUse as unknown[]).slice(3);
          return originalUse.apply(thisArgUse, [req, res, nextProxy, rest]);
        });
      },
    });
  }

  // guards
  if (typeof proto.canActivate === 'function') {
    proto.canActivate = new Proxy(proto.canActivate, {
      apply: (originalCanActivate, thisArg, args) => {
        if (!args[0]) {
          return originalCanActivate.apply(thisArg, args);
        }
        return startSpan(getMiddlewareSpanOptions(target, undefined, 'guard'), () =>
          originalCanActivate.apply(thisArg, args),
        );
      },
    });
  }

  // pipes
  if (typeof proto.transform === 'function') {
    proto.transform = new Proxy(proto.transform, {
      apply: (originalTransform, thisArg, args) => {
        if (!args[0] || !args[1]) {
          return originalTransform.apply(thisArg, args);
        }
        return startSpan(getMiddlewareSpanOptions(target, undefined, 'pipe'), () =>
          originalTransform.apply(thisArg, args),
        );
      },
    });
  }

  // interceptors
  if (typeof proto.intercept === 'function') {
    proto.intercept = patchInterceptor(target, proto.intercept, seenContexts);
  }
}

/**
 * Port the vendored `@Catch` instrumentation. Patch the exception filter's
 * prototype `catch` so each invocation opens an `exception_filter` span. The
 * runtime guard (exception + host present) avoids false positives.
 */
export function patchCatchTarget(target: CatchTarget): void {
  const proto = target?.prototype;
  if (!proto || typeof proto.catch !== 'function' || target.__SENTRY_INTERNAL__ || isTargetPatched(target)) {
    return;
  }
  proto.catch = new Proxy(proto.catch, {
    apply: (originalCatch, thisArg, args) => {
      const [exception, host] = args as unknown[];
      if (!exception || !host) {
        return originalCatch.apply(thisArg, args);
      }
      return startSpan(getMiddlewareSpanOptions(target, undefined, 'exception_filter'), () =>
        originalCatch.apply(thisArg, args),
      );
    },
  });
}
