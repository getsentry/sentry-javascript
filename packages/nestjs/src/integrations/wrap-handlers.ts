import type { Scope } from '@sentry/core';
import { captureException, isObjectLike, isThenable, startSpan, withIsolationScope } from '@sentry/core';
import type { AnyFn, ReflectWithMetadata } from './helpers';
import {
  copyReflectMetadata,
  getBullMQProcessSpanOptions,
  getEventSpanOptions,
  isWrapped,
  markWrapped,
} from './helpers';

/**
 * Span-emitting / error-capturing logic for the `@Cron`/`@Interval`/
 * `@Timeout` (schedule), `@OnEvent` (event), and BullMQ processor and lifecycle
 * handlers.
 *
 * @module
 */

// Error-capture mechanism types. These do NOT carry an `orchestrion` segment.
// They're identical across both paths so captured errors attribute and group
// the same regardless of which instrumentation caught them.
export const MECHANISM_CRON = 'auto.function.nestjs.cron';
export const MECHANISM_INTERVAL = 'auto.function.nestjs.interval';
export const MECHANISM_TIMEOUT = 'auto.function.nestjs.timeout';
export const MECHANISM_EVENT = 'auto.event.nestjs';
export const MECHANISM_BULLMQ = 'auto.queue.nestjs.bullmq';

const bullMQJobScopes = new WeakMap<object, Scope>();

function withBullMQJobScope<T>(job: unknown, callback: () => T): T {
  if (!isObjectLike(job)) {
    return withIsolationScope(callback);
  }

  const existingScope = bullMQJobScopes.get(job);
  if (existingScope) {
    return withIsolationScope(existingScope, callback);
  }

  return withIsolationScope(scope => {
    bullMQJobScopes.set(job, scope);
    return callback();
  });
}

const EVENT_LISTENER_METADATA = 'EVENT_LISTENER_METADATA';

interface ProcessorTarget {
  __SENTRY_INTERNAL__?: boolean;
  prototype?: { process?: AnyFn };
}

function captureHandlerError(error: unknown, mechanismType: string): void {
  captureException(error, { mechanism: { handled: false, type: mechanismType } });
}

/**
 * Preserve synchronous throws so the caller's error handling still applies.
 */
export function wrapScheduleHandler(handler: AnyFn, mechanismType: string): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    const invoke = (): unknown => {
      let result: unknown;
      try {
        result = handler.apply(this, args);
      } catch (error) {
        captureHandlerError(error, mechanismType);
        throw error;
      }
      if (isThenable(result)) {
        return result.then(undefined, (error: unknown) => {
          captureHandlerError(error, mechanismType);
          throw error;
        });
      }
      return result;
    };

    return withIsolationScope(invoke);
  };
}

/**
 * @param shareJobScope Reuse the first argument's (BullMQ Job) scope so lifecycle hooks share context with process().
 */
export function wrapBullMQEventHandler(handler: AnyFn, shareJobScope: boolean = false): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    const invoke = (): unknown => handler.apply(this, args);
    return shareJobScope ? withBullMQJobScope(args[0], invoke) : withIsolationScope(invoke);
  };
}

function eventNameFromEvent(event: unknown): string {
  if (typeof event === 'string') {
    return event;
  }
  if (Array.isArray(event)) {
    return event.map(eventNameFromEvent).join(',');
  }
  return String(event);
}

/**
 * Derive the event name(s) for an @OnEvent span. The wrapped handler carries
 * `EVENT_LISTENER_METADATA` (set by the original decorator), which lists every
 * event when multiple @OnEvent decorators are stacked; fall back to the event
 * captured from the decorator factory.
 */
function deriveEventName(handler: AnyFn, fallbackEvent: unknown): string {
  const R = Reflect as unknown as ReflectWithMetadata;
  if (typeof R.getMetadataKeys === 'function' && typeof R.getMetadata === 'function') {
    if (R.getMetadataKeys(handler)?.includes(EVENT_LISTENER_METADATA)) {
      const eventData = R.getMetadata(EVENT_LISTENER_METADATA, handler);
      if (Array.isArray(eventData)) {
        return (eventData as unknown[])
          .map(entry => {
            const event = isObjectLike(entry) ? (entry as { event?: unknown }).event : undefined;
            return event ? eventNameFromEvent(event) : '';
          })
          .reverse() // decorators evaluate bottom to top
          .join('|');
      }
    }
  }
  return eventNameFromEvent(fallbackEvent);
}

/**
 * Wrap an @OnEvent handler: fork the isolation scope, open an `event.nestjs`
 * transaction, and capture errors (event-handler errors bypass the global filter).
 */
export function wrapEventHandler(handler: AnyFn, fallbackEvent: unknown): AnyFn {
  const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    const eventName = deriveEventName(wrapped, fallbackEvent);
    return withIsolationScope(() =>
      startSpan(getEventSpanOptions(eventName), async () => {
        try {
          return await handler.apply(this, args);
        } catch (error) {
          captureHandlerError(error, MECHANISM_EVENT);
          throw error;
        }
      }),
    );
  };
  return wrapped;
}

/**
 * Wrap a BullMQ `process` method: reuse the job's isolation scope, open a
 * `queue.process` transaction, and capture errors.
 */
export function wrapBullMQProcess(process: AnyFn, queueName: string | undefined): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    return withBullMQJobScope(args[0], () =>
      startSpan(getBullMQProcessSpanOptions(queueName), async () => {
        try {
          return await process.apply(this, args);
        } catch (error) {
          captureHandlerError(error, MECHANISM_BULLMQ);
          throw error;
        }
      }),
    );
  };
}

/**
 * Replace a method decorator's `descriptor.value` with a wrapped handler (via
 * `wrapHandler`), preserving the handler name and marking it wrapped. Used by
 * the orchestrion factory subscriber.
 */
export function patchMethodDescriptor(
  target: { __SENTRY_INTERNAL__?: boolean } | undefined,
  propertyKey: string | symbol | undefined,
  descriptor: PropertyDescriptor | undefined,
  wrapHandler: (handler: AnyFn) => AnyFn,
): void {
  const handler = descriptor?.value as AnyFn | undefined;
  if (descriptor && handler && typeof handler === 'function' && !target?.__SENTRY_INTERNAL__ && !isWrapped(handler)) {
    const wrapped = wrapHandler(handler);
    copyReflectMetadata(handler, wrapped);
    Object.defineProperty(wrapped, 'name', {
      value: handler.name || String(propertyKey),
      configurable: true,
    });
    markWrapped(wrapped);
    descriptor.value = wrapped;
  }
}

/**
 * Extract the queue name from `@Processor('name')` or `@Processor({ name })`.
 */
export function extractQueueName(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object' && 'name' in arg && typeof (arg as { name?: unknown }).name === 'string') {
    return (arg as { name: string }).name;
  }
  return undefined;
}

/**
 * Patch a `@Processor`-decorated class's `prototype.process` with a wrapped
 * version.
 */
export function patchProcessorTarget(target: ProcessorTarget | undefined, queueName: string | undefined): void {
  const prototype = target?.prototype;
  const process = prototype?.process;
  if (prototype && process && typeof process === 'function' && !target?.__SENTRY_INTERNAL__ && !isWrapped(process)) {
    const wrapped = wrapBullMQProcess(process, queueName);
    markWrapped(wrapped);
    prototype.process = wrapped;
  }
}
