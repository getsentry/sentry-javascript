import type { Span } from '@sentry/core';
import {
  addNonEnumerableProperty,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  withActiveSpan,
} from '@sentry/core';
import { isOrchestrionInjected } from '@sentry/server-utils/orchestrion';
import type { CatchTarget, InjectableTarget, NextFunction, Observable, Subscription } from './types';

/** A function of unknown signature, matching the methods/handlers we wrap. */
export type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Marks a function as already wrapped so repeated subscriptions/decoration
 * don't double-wrap it. Shared by the OTel and orchestrion paths.
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
 * Mark a target class as patched (for the given pass) so it's instrumented only
 * once, and to stay idempotent across repeated subscriptions/decoration.
 *
 * The `@Injectable` and `@Catch` passes use *separate* flags on purpose: they
 * wrap disjoint method sets (use/canActivate/transform/intercept vs catch), and
 * a class can be decorated with both (an exception filter that also uses DI).
 * A single shared flag would let whichever pass fired first latch it and block
 * the other, dropping that pass's spans regardless of ordering.
 */
export function isTargetPatched(target: object, flag: 'sentryPatchedInjectable' | 'sentryPatchedCatch'): boolean {
  if ((target as Record<string, unknown>)[flag]) {
    return true;
  }
  addNonEnumerableProperty(target, flag, true);
  return false;
}

// The instrumentation path is reflected in the span origin: orchestrion-created
// spans carry an `orchestrion` segment so they're distinguishable from OTel.
// Everything else about the span is identical.

/** Origin for middleware/guard/pipe/interceptor/exception_filter spans. */
function middlewareOrigin(componentType?: string): string {
  const base = isOrchestrionInjected() ? 'auto.middleware.orchestrion.nestjs' : 'auto.middleware.nestjs';
  return componentType ? `${base}.${componentType}` : base;
}

/** Origin for the app-creation / request-context / request-handler HTTP spans. */
export function httpOrigin(): string {
  return isOrchestrionInjected() ? 'auto.http.orchestrion.nestjs' : 'auto.http.otel.nestjs';
}

/** Origin for `@OnEvent` spans. */
function eventOrigin(): string {
  return isOrchestrionInjected() ? 'auto.event.orchestrion.nestjs' : 'auto.event.nestjs';
}

/** Origin for BullMQ `@Processor` `process` spans. */
function bullmqOrigin(): string {
  return isOrchestrionInjected() ? 'auto.queue.orchestrion.nestjs.bullmq' : 'auto.queue.nestjs.bullmq';
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
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
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
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'event.nestjs',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: eventOrigin(),
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
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: bullmqOrigin(),
      'messaging.system': 'bullmq',
      'messaging.destination.name': queueName,
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
