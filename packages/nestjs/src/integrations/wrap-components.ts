import type { Span } from '@sentry/core';
import { getActiveSpan, isThenable, startInactiveSpan, startSpan, startSpanManual, withActiveSpan } from '@sentry/core';
import type { AnyFn } from './helpers';
import { getMiddlewareSpanOptions, getNextProxy, instrumentObservable, isTargetPatched } from './helpers';
import type { CallHandler, CatchTarget, InjectableTarget, MinimalNestJsExecutionContext, Observable } from './types';

/**
 * Shared span-emitting logic for `@Injectable`
 * (middleware/guard/pipe/interceptor) and `@Catch` (exception filter) classes.
 * Used by both the OTel decorator wraps (`SentryNestInstrumentation`) and the
 * orchestrion channel subscriber.
 */

function patchInterceptor(
  target: InjectableTarget,
  intercept: AnyFn,
  seenContexts: WeakSet<MinimalNestJsExecutionContext>,
): AnyFn {
  return new Proxy(intercept, {
    apply: (originalIntercept, thisArg, argsIntercept) => {
      const context = argsIntercept[0] as MinimalNestJsExecutionContext | undefined;
      const next = argsIntercept[1] as CallHandler | undefined;
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
        // eslint-disable-next-line @typescript-eslint/unbound-method
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

        // async interceptor: returns a Promise<Observable>
        if (isThenable(returned)) {
          return returned.then(
            (observable: unknown) => {
              if (afterSpan) {
                instrumentObservable(observable as Observable<unknown>, afterSpan);
              } else {
                // `next.handle()` was never called, so nothing ended the
                // before-span (its `handle` proxy never ran); close it here.
                beforeSpan.end();
              }
              return observable;
            },
            (e: unknown) => {
              beforeSpan.end();
              afterSpan?.end();
              throw e;
            },
          );
        }

        // Sync interceptor: `next.handle()` (if it was going to be called) has
        // already run synchronously, so `afterSpan` is settled.
        if (!afterSpan) {
          // `next.handle()` was never called (e.g. the interceptor
          // short-circuited for a cache/validation hit), so its `handle` proxy
          // never ended the before-span; close it here.
          beforeSpan.end();
          return returned;
        }

        // sync interceptor: returns an Observable
        if (typeof (returned as Observable<unknown>).subscribe === 'function') {
          instrumentObservable(returned as Observable<unknown>, afterSpan);
        }

        return returned;
      });
    },
  });
}

/**
 * Patch an `@Injectable`-decorated class's prototype methods so each runtime
 * invocation opens the corresponding middleware/guard/pipe/interceptor span.
 * The runtime guards (req/res/next, context, value+metadata) avoid false
 * positives on non-middleware classes that happen to expose a same-named
 * method.
 */
export function patchInjectableTarget(
  target: InjectableTarget,
  seenContexts: WeakSet<MinimalNestJsExecutionContext>,
): void {
  const proto = target?.prototype;
  if (!proto || target.__SENTRY_INTERNAL__ || isTargetPatched(target, 'sentryPatchedInjectable')) {
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
          return (originalUse as AnyFn).apply(thisArgUse, [req, res, nextProxy, ...rest]);
        });
      },
    }) as InjectableTarget['prototype']['use'];
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
    }) as InjectableTarget['prototype']['canActivate'];
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
    }) as InjectableTarget['prototype']['transform'];
  }

  // interceptors
  if (typeof proto.intercept === 'function') {
    proto.intercept = patchInterceptor(
      target,
      proto.intercept as AnyFn,
      seenContexts,
    ) as InjectableTarget['prototype']['intercept'];
  }
}

/**
 * Patch an exception filter's prototype `catch` so each invocation opens an
 * `exception_filter` span. The runtime guard (exception + host present) avoids
 * false positives.
 */
export function patchCatchTarget(target: CatchTarget): void {
  const proto = target?.prototype;
  if (
    !proto ||
    typeof proto.catch !== 'function' ||
    target.__SENTRY_INTERNAL__ ||
    isTargetPatched(target, 'sentryPatchedCatch')
  ) {
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
  }) as CatchTarget['prototype']['catch'];
}
