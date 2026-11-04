import {
  CODE_FUNCTION_NAME,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  SENTRY_DESCRIPTION,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { FUNCTION, MIDDLEWARE, QUEUE_PROCESS } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  addNonEnumerableProperty,
  getClient,
  hasSpanStreamingEnabled,
  isObjectLike,
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

// `@nestjs/schedule`'s metadata key for the `@Cron()` options.
const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';
const SENTRY_CRON_METADATA = 'sentry:nestjs:sentry_cron';

/** The options `@Cron()` stored as metadata on `fn`, if any. */
export function getCronOptions(fn: object): object | undefined {
  const R = Reflect as ReflectWithMetadata;
  const options = typeof R.getMetadata === 'function' ? R.getMetadata(SCHEDULE_CRON_OPTIONS, fn) : undefined;
  return isObjectLike(options) ? options : undefined;
}

/**
 * Marks a method that `@SentryCron()` monitors, and the options of its `@Cron()` if it already has one, so
 * `@Cron()` monitoring skips it. Decorators between it and a `@Cron()` above copy the metadata outward.
 */
export function markSentryCronMethod(fn: object): void {
  const R = Reflect as ReflectWithMetadata;
  if (typeof R.defineMetadata !== 'function') {
    return;
  }
  R.defineMetadata(SENTRY_CRON_METADATA, true, fn);
  const cronOptions = getCronOptions(fn);
  if (cronOptions) {
    R.defineMetadata(SENTRY_CRON_METADATA, true, cronOptions);
  }
}

/** Whether `fn` or its `@Cron()` options are marked by {@link markSentryCronMethod}. */
export function isSentryCronMethod(fn: object): boolean {
  const R = Reflect as ReflectWithMetadata;
  if (typeof R.getMetadata !== 'function') {
    return false;
  }
  const cronOptions = getCronOptions(fn);
  return (
    R.getMetadata(SENTRY_CRON_METADATA, fn) === true ||
    (!!cronOptions && R.getMetadata(SENTRY_CRON_METADATA, cronOptions) === true)
  );
}

const NEST_SCHEDULE_VERSIONS = new WeakMap<object, string>();

/** Remembers the `@nestjs/schedule` version whose `@Cron()` stored the options on `method`. */
export function setNestScheduleVersion(method: unknown, version: string | undefined): void {
  if (typeof method !== 'function' || !version) {
    return;
  }
  const cronOptions = getCronOptions(method);
  if (cronOptions) {
    NEST_SCHEDULE_VERSIONS.set(cronOptions, version);
  }
}

/** The `@nestjs/schedule` version that stored these `@Cron()` options, if the SDK saw the decorator run. */
export function getNestScheduleVersion(cronOptions: object): string | undefined {
  return NEST_SCHEDULE_VERSIONS.get(cronOptions);
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
      [SENTRY_OP]: MIDDLEWARE,
      [SENTRY_ORIGIN]: middlewareOrigin(componentType),
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
  const client = getClient();
  const isStreamed = !!client && hasSpanStreamingEnabled(client);
  const description = `event ${event}`;

  return {
    // With span streaming, a `function` span is named after what it wraps. An `@OnEvent` handler is
    // identified by the event it listens to, so that doubles as its `code.function.name`.
    name: isStreamed ? event : description,
    attributes: {
      [SENTRY_OP]: FUNCTION,
      [CODE_FUNCTION_NAME]: event,
      [SENTRY_ORIGIN]: 'auto.event.nestjs',
      // Relay infers a `function` span's description from `code.function.name` alone, which drops the prefix.
      ...(isStreamed && { [SENTRY_DESCRIPTION]: description }),
    },
    // oxlint-disable-next-line typescript/no-deprecated
    forceTransaction: true,
  };
}

const PROCESS_OPERATION = 'process';

/**
 * Returns span options for nest bullmq process spans. `queueName` is undefined when the `@Processor`
 * decorator has no queue name.
 */
export function getBullMQProcessSpanOptions(queueName: string | undefined): {
  name: string;
  attributes: Record<string, string | undefined>;
} {
  const client = getClient();
  const isStreamed = !!client && hasSpanStreamingEnabled(client);

  // Only the word order differs between lifecycles (to keep the old naming pattern).
  const name = queueName
    ? isStreamed
      ? `${PROCESS_OPERATION} ${queueName}`
      : `${queueName} ${PROCESS_OPERATION}`
    : PROCESS_OPERATION;

  return {
    name,
    attributes: {
      [SENTRY_OP]: QUEUE_PROCESS,
      [SENTRY_ORIGIN]: 'auto.queue.nestjs.bullmq',
      [MESSAGING_SYSTEM]: 'bullmq',
      [MESSAGING_OPERATION_TYPE]: PROCESS_OPERATION,
      [MESSAGING_DESTINATION_NAME]: queueName,
    },
  };
}

/**
 * Adds instrumentation to a js observable and attaches the span to an active
 * parent span.
 */
export function instrumentObservable(
  observable: Observable<unknown>,
  activeSpan: Span | undefined,
  onError?: (error: unknown) => void,
): void {
  if (activeSpan) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    observable.subscribe = new Proxy(observable.subscribe, {
      apply: (originalSubscribe, thisArgSubscribe, argsSubscribe) => {
        return withActiveSpan(activeSpan, () => {
          const subscribeArgs = [...argsSubscribe];

          if (onError) {
            const observer = argsSubscribe[0];
            if (observer && typeof observer === 'object') {
              subscribeArgs[0] = new Proxy(observer, {
                get(target, property, receiver) {
                  if (property !== 'error') {
                    return Reflect.get(target, property, receiver);
                  }

                  const errorHandler = Reflect.get(target, property, target);
                  if (typeof errorHandler === 'function') {
                    return function (this: unknown, error: unknown): unknown {
                      onError(error);
                      return Reflect.apply(errorHandler, target, [error]);
                    };
                  }

                  // Preserve RxJS's positional error-handler fallback for observer objects.
                  if (errorHandler || typeof argsSubscribe[1] !== 'function') {
                    return function (this: unknown, error: unknown): never {
                      onError(error);
                      throw error;
                    };
                  }
                  return errorHandler;
                },
              });
            }

            const errorHandler = argsSubscribe[1];
            subscribeArgs[1] = function (this: unknown, error: unknown): unknown {
              onError(error);
              if (typeof errorHandler !== 'function') {
                throw error;
              }
              return Reflect.apply(errorHandler, this, [error]);
            };
          }

          const subscription: Subscription = originalSubscribe.apply(thisArgSubscribe, subscribeArgs);
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
