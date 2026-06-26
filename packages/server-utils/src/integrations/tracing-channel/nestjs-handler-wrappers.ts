import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  captureException,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import type { AnyFn, ChannelContext } from './nestjs-shared';
import { isWrapped, markWrapped } from './nestjs-shared';

const NOOP = (): void => {};

// Mechanism types for scheduled-handler error capture (no span)
// match vendored `SentryNestScheduleInstrumentation`
const MECHANISM_CRON = 'auto.function.nestjs.cron';
const MECHANISM_INTERVAL = 'auto.function.nestjs.interval';
const MECHANISM_TIMEOUT = 'auto.function.nestjs.timeout';
const MECHANISM_EVENT = 'auto.event.nestjs';
const MECHANISM_BULLMQ = 'auto.queue.nestjs.bullmq';

const EVENT_LISTENER_METADATA = 'EVENT_LISTENER_METADATA';

interface ReflectWithMetadata {
  getMetadataKeys?: (target: object) => unknown[];
  getMetadata?: (key: unknown, target: object) => unknown;
}

/**
 * The class a `@Processor` decorator is applied to (a BullMQ queue processor). */
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
 * return type, so sync and async errors are handled on separate paths
 * matches vendored OTel implementation
 */
function wrapScheduleHandler(handler: AnyFn, mechanismType: string): AnyFn {
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
            const event = entry && typeof entry === 'object' ? (entry as { event?: unknown }).event : undefined;
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
 * transaction, and capture errors. (event-handler errors bypass the global
 * filter)
 */
function wrapEventHandler(handler: AnyFn, fallbackEvent: unknown): AnyFn {
  const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    const eventName = deriveEventName(wrapped, fallbackEvent);
    return withIsolationScope(() =>
      startSpan(
        {
          name: `event ${eventName}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'event.nestjs',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MECHANISM_EVENT,
          },
          forceTransaction: true,
        },
        async () => {
          try {
            return await handler.apply(this, args);
          } catch (error) {
            captureHandlerError(error, MECHANISM_EVENT);
            throw error;
          }
        },
      ),
    );
  };
  return wrapped;
}

/**
 * Wrap a BullMQ `process` method: fork the isolation scope, open a
 * `queue.process` transaction, and capture errors.
 */
function wrapBullMQProcess(process: AnyFn, queueName: string): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    return withIsolationScope(() =>
      startSpan(
        {
          name: `${queueName} process`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MECHANISM_BULLMQ,
            'messaging.system': 'bullmq',
            'messaging.destination.name': queueName,
          },
          forceTransaction: true,
        },
        async () => {
          try {
            return await process.apply(this, args);
          } catch (error) {
            captureHandlerError(error, MECHANISM_BULLMQ);
            throw error;
          }
        },
      ),
    );
  };
}

/**
 * Wrap a method decorator (the function the factory returns for
 * `@Cron`/`@Interval`/`@Timeout`/`@OnEvent`) so it replaces
 * `descriptor.value` with a wrapped handler before delegating to the
 * original decorator (which then attaches its metadata to our wrapper).
 */
function makeMethodDecorator(original: AnyFn, wrapHandler: (handler: AnyFn) => AnyFn): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    const target = args[0] as { __SENTRY_INTERNAL__?: boolean } | undefined;
    const propertyKey = args[1];
    const descriptor = args[2] as PropertyDescriptor | undefined;
    const handler = descriptor?.value;
    if (handler && typeof handler === 'function' && !target?.__SENTRY_INTERNAL__ && !isWrapped(handler as AnyFn)) {
      const wrapped = wrapHandler(handler as AnyFn);
      Object.defineProperty(wrapped, 'name', {
        value: (handler as AnyFn).name || String(propertyKey),
        configurable: true,
      });
      markWrapped(wrapped);
      descriptor.value = wrapped;
    }
    return original.apply(this, args);
  };
}

/**
 * Wrap the class decorator @Processor returns so it patches
 * `target.prototype.process` before delegating to the original decorator.
 */
function makeProcessorDecorator(original: AnyFn, queueName: string): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    const target = args[0] as ProcessorTarget | undefined;
    const process = target?.prototype?.process;
    if (process && typeof process === 'function' && !target?.__SENTRY_INTERNAL__ && !isWrapped(process)) {
      const wrapped = wrapBullMQProcess(process, queueName);
      markWrapped(wrapped);
      target.prototype!.process = wrapped;
    }
    return original.apply(this, args);
  };
}

function extractQueueName(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object' && 'name' in arg && typeof (arg as { name?: unknown }).name === 'string') {
    return (arg as { name: string }).name;
  }
  return 'unknown';
}

/**
 * Subscribe to a decorator-factory channel. The factory is matched with
 * `mutableResult`, so `end` can replace `data.result` (the decorator the
 * factory returns) with a wrapped version. `wrap` receives the original
 * decorator and the channel context (for the factory's args, e.g. the BullMQ
 * queue name).
 */
function subscribeFactoryDecorator(channelName: string, wrap: (decorator: AnyFn, data: ChannelContext) => AnyFn): void {
  diagnosticsChannel.tracingChannel<ChannelContext>(channelName).subscribe({
    start: NOOP,
    end(data) {
      const decorator = data.result;
      if (typeof decorator === 'function' && !isWrapped(decorator as AnyFn)) {
        const wrapped = wrap(decorator as AnyFn, data);
        markWrapped(wrapped);
        data.result = wrapped;
      }
    },
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}

/**
 * Subscribe the @Cron/@Interval/@Timeout (schedule), @OnEvent (event-emitter)
 * and @Processor (bullmq) decorator channels. Each factory is matched with
 * `mutableResult`; we replace the decorator it returns with one that wraps the
 * user handler (schedule/event) or the `process` method (bullmq).
 */
export function subscribeNestHandlerDecorators(): void {
  subscribeFactoryDecorator(CHANNELS.NESTJS_SCHEDULE_CRON, decorator =>
    makeMethodDecorator(decorator, handler => wrapScheduleHandler(handler, MECHANISM_CRON)),
  );
  subscribeFactoryDecorator(CHANNELS.NESTJS_SCHEDULE_INTERVAL, decorator =>
    makeMethodDecorator(decorator, handler => wrapScheduleHandler(handler, MECHANISM_INTERVAL)),
  );
  subscribeFactoryDecorator(CHANNELS.NESTJS_SCHEDULE_TIMEOUT, decorator =>
    makeMethodDecorator(decorator, handler => wrapScheduleHandler(handler, MECHANISM_TIMEOUT)),
  );
  subscribeFactoryDecorator(CHANNELS.NESTJS_ONEVENT, (decorator, data) =>
    makeMethodDecorator(decorator, handler => wrapEventHandler(handler, data.arguments?.[0])),
  );
  subscribeFactoryDecorator(CHANNELS.NESTJS_PROCESSOR, (decorator, data) =>
    makeProcessorDecorator(decorator, extractQueueName(data.arguments?.[0])),
  );
}
