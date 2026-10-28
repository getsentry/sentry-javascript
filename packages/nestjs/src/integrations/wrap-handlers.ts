import { captureException, isObjectLike, isThenable, startSpan, withIsolationScope, withMonitor } from '@sentry/core';
import { makeCronMonitorResolver } from './cron-monitoring';
import type { AnyFn, ReflectWithMetadata } from './helpers';
import {
  getBullMQProcessSpanOptions,
  getCronOptions,
  getEventSpanOptions,
  isSentryCronMethod,
  isWrapped,
  markWrapped,
} from './helpers';

/**
 * Span-emitting / error-capturing logic for the `@Cron`/`@Interval`/
 * `@Timeout` (schedule), `@OnEvent` (event), and `@Processor` (bullmq)
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

const EVENT_LISTENER_METADATA = 'EVENT_LISTENER_METADATA';

interface ProcessorTarget {
  __SENTRY_INTERNAL__?: boolean;
  prototype?: { process?: AnyFn };
}

function captureHandlerError(error: unknown, mechanismType: string): void {
  captureException(error, { mechanism: { handled: false, type: mechanismType } });
}

/**
 * Wrap a scheduled handler (`@Cron`/`@Interval`/`@Timeout`): fork the
 * isolation scope and capture errors. NOT async. Preserve the handler's sync
 * return type, so sync and async errors are handled on separate paths.
 */
export function wrapScheduleHandler(handler: AnyFn, mechanismType: string): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    return withIsolationScope(() => {
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
    });
  };
}

const CRON_HANDLER_MONITORS = new WeakMap<AnyFn, () => boolean>();
const CRON_OPTIONS_MONITORS = new WeakMap<object, () => boolean>();

/**
 * Link the `@Cron()` options that `@nestjs/schedule` set on `method` to its monitor. Decorators applied above
 * `@Cron()` replace the method but must copy this metadata for Nest to schedule it, so it identifies the job.
 */
export function linkCronOptionsToMonitor(method: unknown): void {
  const isMonitored = typeof method === 'function' ? CRON_HANDLER_MONITORS.get(method as AnyFn) : undefined;
  const options = isMonitored && getCronOptions(method as AnyFn);
  if (isMonitored && options) {
    CRON_OPTIONS_MONITORS.set(options, isMonitored);
  }
}

/** Whether a `@Cron()` method sends check-ins when it runs, from `monitorCronJobs` or `@SentryCron()`. */
export function sendsCronCheckIns(method: unknown): boolean {
  if (typeof method !== 'function') {
    return false;
  }
  const fn = method as AnyFn;
  const options = getCronOptions(fn);
  return (
    isSentryCronMethod(fn) ||
    !!CRON_HANDLER_MONITORS.get(fn)?.() ||
    !!(options && CRON_OPTIONS_MONITORS.get(options)?.())
  );
}

/**
 * Wrap a `@Cron` handler like {@link wrapScheduleHandler}, sending check-ins when `monitorCronJobs` is enabled.
 */
export function wrapCronHandler(
  handler: AnyFn,
  cronArgs: unknown[],
  target: unknown,
  propertyKey: string | symbol | undefined,
): AnyFn {
  const scheduleHandler = wrapScheduleHandler(handler, MECHANISM_CRON);
  const resolveMonitor = makeCronMonitorResolver(cronArgs, target, propertyKey);

  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    const monitor = resolveMonitor(handler, wrapped);
    if (!monitor) {
      return scheduleHandler.apply(this, args);
    }
    return withMonitor(monitor.slug, () => scheduleHandler.apply(this, args), monitor.config);
  };
  CRON_HANDLER_MONITORS.set(
    wrapped,
    () => isSentryCronMethod(handler) || isSentryCronMethod(wrapped) || !!resolveMonitor(handler, wrapped),
  );
  return wrapped;
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
 * Wrap a BullMQ `process` method: fork the isolation scope, open a
 * `queue.process` transaction, and capture errors.
 */
export function wrapBullMQProcess(process: AnyFn, queueName: string | undefined): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    return withIsolationScope(() =>
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
  wrapHandler: (handler: AnyFn, target: unknown, propertyKey: string | symbol | undefined) => AnyFn,
): void {
  const handler = descriptor?.value as AnyFn | undefined;
  if (descriptor && handler && typeof handler === 'function' && !target?.__SENTRY_INTERNAL__ && !isWrapped(handler)) {
    const wrapped = wrapHandler(handler, target, propertyKey);
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
