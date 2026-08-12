import { SENTRY_OP } from '@sentry/conventions/attributes';
import { WEB_SERVER_FUNCTION_SPAN_OP, WEB_SERVER_MIDDLEWARE_SPAN_OP } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  addNonEnumerableProperty,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  withActiveSpan,
} from '@sentry/core';
import type { CatchTarget, InjectableTarget, NextFunction, Observable, Subscription } from './types';

/** A function of unknown signature, matching the methods/handlers we wrap. */
export type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Marks a function as already wrapped so repeated subscriptions/decoration
 * don't double-wrap it.
 */
const SENTRY_WRAPPED = Symbol.for('sentry.nestjs.wrapped');

/** Whether `fn` has already been wrapped by this integration. */
export function isWrapped(fn: AnyFn): boolean {
  return !!(fn as AnyFn & Record<symbol, unknown>)[SENTRY_WRAPPED];
}

/** Mark `fn` as wrapped (see {@link isWrapped}). */
export function markWrapped(fn: AnyFn): void {
  (fn as AnyFn & Record<symbol, unknown>)[SENTRY_WRAPPED] = true;
}

/**
 * The subset of `reflect-metadata`'s `Reflect` augmentation that NestJS
 * relies on. Methods are optional because `reflect-metadata` may not be
 * loaded; guard each before use.
 */
export interface ReflectWithMetadata {
  getMetadataKeys?: (target: object) => unknown[];
  getMetadata?: (key: unknown, target: object) => unknown;
  defineMetadata?: (key: unknown, value: unknown, target: object) => void;
}

/**
 * Copy NestJS reflect-metadata from one object onto another so decorators
 * (param decorators, guards, `@EventPattern`, ...) that read it keep working
 * No-op when `reflect-metadata` isn't loaded.
 */
export function copyReflectMetadata(from: object, to: object): void {
  const R = Reflect as ReflectWithMetadata;
  if (
    typeof R.getMetadataKeys !== 'function' ||
    typeof R.getMetadata !== 'function' ||
    typeof R.defineMetadata !== 'function'
  ) {
    return;
  }
  for (const key of R.getMetadataKeys(from)) {
    R.defineMetadata(key, R.getMetadata(key, from), to);
  }
}

/**
 * Mark a target class as patched (for the given pass) so it's instrumented
 * only once, and to stay idempotent across repeated subscriptions/decoration.
 */
export function isTargetPatched(target: object, flag: 'sentryPatchedInjectable' | 'sentryPatchedCatch'): boolean {
  if ((target as Record<string, unknown>)[flag]) {
    return true;
  }
  addNonEnumerableProperty(target, flag, true);
  return false;
}

/** Origin for the app-creation / request-context / request-handler HTTP spans. */
export const HTTP_ORIGIN = 'auto.http.nestjs';

/** Origin for middleware/guard/pipe/interceptor/exception_filter spans. */
function middlewareOrigin(componentType?: string): string {
  const base = 'auto.middleware.nestjs';
  return componentType ? `${base}.${componentType}` : base;
}

/**
 * Returns span options for nest middleware spans.
 * name = provided name or class name.
 */
export function getMiddlewareSpanOptions(
  target: InjectableTarget | CatchTarget | { name?: string },
  name: string | undefined = undefined,
  componentType: string | undefined = undefined,
): { name: string; attributes: Record<string, string> } {
  return {
    name: name ?? target.name ?? 'unknown',
    attributes: {
      [SENTRY_OP]: WEB_SERVER_MIDDLEWARE_SPAN_OP,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: middlewareOrigin(componentType),
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
      [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.event.nestjs',
    },
    forceTransaction: true,
  };
}

/**
 * Returns span options for nest bullmq process spans.
 */
export function getBullMQProcessSpanOptions(queueName: string): {
  name: string;
  attributes: Record<string, string>;
  forceTransaction: boolean;
} {
  return {
    name: `${queueName} process`,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.queue.nestjs.bullmq',
      'messaging.system': 'bullmq',
      'messaging.destination.name': queueName,
    },
    forceTransaction: true,
  };
}

/**
 * Adds instrumentation to a js observable and attaches the span to an active
 * parent span.
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
 * Proxies the next() call in a nestjs middleware to end the span when called
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
