import * as diagnosticsChannel from 'node:diagnostics_channel';
import { debug, startInactiveSpan, waitForTracingChannelBinding } from '@sentry/core';
import { bindTracingChannelToSpan } from '@sentry/server-utils';
import { nestjsChannels as CHANNELS } from '@sentry/server-utils/orchestrion';
import { DEBUG_BUILD } from '../debug-build';
import type { AnyFn } from './helpers';
import { isWrapped, markWrapped } from './helpers';
import type { CatchTarget, InjectableTarget, MinimalNestJsExecutionContext } from './types';
import { patchCatchTarget, patchInjectableTarget } from './wrap-components';
import {
  extractQueueName,
  MECHANISM_CRON,
  MECHANISM_INTERVAL,
  MECHANISM_TIMEOUT,
  patchMethodDescriptor,
  patchProcessorTarget,
  wrapEventHandler,
  wrapScheduleHandler,
} from './wrap-handlers';
import { getAppCreationSpanOptions, wrapRequestContextHandler, wrapRouteHandler } from './wrap-route';

const NOOP = (): void => {};

/**
 * The orchestrion tracing-channel context. `arguments` is the live call args
 * array; `result` is the return value, which an `end` handler may reassign to
 * substitute it (`traceSync`/`tracePromise` always return `ctx.result`).
 */
interface ChannelContext {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

/**
 * Subscribe to a decorator channel (`Injectable`/`Catch`).
 *
 * The orchestrion transform targets the decorator's inner arrow, so `start`
 * receives the decorated class as `arguments[0]`. There is no span around the
 * decorator itself; `patch` installs the prototype-method proxies that open
 * spans later.
 */
function subscribeDecoratorChannel<T>(channelName: string, patch: (target: T) => void): void {
  diagnosticsChannel.tracingChannel<ChannelContext>(channelName).subscribe({
    start(data) {
      const target = data.arguments?.[0] as T | undefined;
      if (target) {
        patch(target);
      }
    },
    end: NOOP,
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}

/**
 * Wrap the method decorator the factory returns so it replaces
 * `descriptor.value` with a wrapped handler before delegating to the
 * original decorator.
 */
function makeMethodDecorator(original: AnyFn, wrapHandler: (handler: AnyFn) => AnyFn): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    patchMethodDescriptor(
      args[0] as { __SENTRY_INTERNAL__?: boolean } | undefined,
      args[1] as string | symbol | undefined,
      args[2] as PropertyDescriptor | undefined,
      wrapHandler,
    );
    return original.apply(this, args);
  };
}

/**
 * Wrap the class decorator `@Processor` returns so it patches
 * `target.prototype.process` before delegating.
 */
function makeProcessorDecorator(original: AnyFn, queueName: string): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    patchProcessorTarget(args[0] as { __SENTRY_INTERNAL__?: boolean; prototype?: { process?: AnyFn } }, queueName);
    return original.apply(this, args);
  };
}

/**
 * Subscribe to a decorator-factory channel. `end` reassigns `data.result` (the
 * decorator the factory returns) with a wrapped version -> `traceSync` returns
 * whatever `end` leaves there. `wrap` receives the original decorator and the
 * channel context (for the factory's args, e.g. the BullMQ queue name).
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
 * Subscribe to the diagnostics_channels the orchestrion code transform
 * injects into `@nestjs/*` modules.
 *
 * Opens the same spans as the OTel `Nest` instrumentation, only with
 * different origin.
 *
 * Called from `nestIntegration`'s `setupOnce` when orchestrion is active
 * (`isOrchestrionInjected()`); requires the runtime hook or bundler plugin.
 */
export function subscribeToNestChannels(): void {
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  DEBUG_BUILD && debug.log('[orchestrion:nestjs] subscribing to @nestjs channels');

  // App-creation span: `bindTracingChannelToSpan` opens the span on
  // `start`, makes it the active context for the bootstrap, and ends it
  // on `asyncEnd` (or `end` if `create` throws synchronously).
  //
  // `captureError: false`: a failed bootstrap surfaces to the caller.
  // We just annotate the span.
  //
  // `bindTracingChannelToSpan` uses `bindStore`, which needs the
  // async-context binding registered after integration `setupOnce`; defer
  // until it's available. Only this bind is deferred (it fires at
  // `NestFactory.create`, so a retry tick is fine); the plain `.subscribe`
  // calls below stay synchronous because the decorator channels fire at
  // module-load time, which a deferred subscription could miss.
  waitForTracingChannelBinding(() => {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<ChannelContext>(CHANNELS.NESTJS_APP_CREATION),
      data => {
        const moduleCls = data.arguments?.[0] as { name?: string } | undefined;
        return startInactiveSpan(getAppCreationSpanOptions(data.moduleVersion, moduleCls?.name));
      },
      { captureError: false },
    );
  });

  // request_context + request_handler. `RouterExecutionContext.create`
  // runs once per route at setup: it receives `(instance, callback, ...)`
  // and RETURNS the per-request handler. `start` wraps the callback arg
  // (-> handler span per call) and `end` reassigns `data.result` to
  // replace the returned handler (-> request_context span per request).
  const routerMeta = new WeakMap<object, { instanceName: string; callbackName: string; moduleVersion?: string }>();
  diagnosticsChannel.tracingChannel<ChannelContext>(CHANNELS.NESTJS_ROUTER_CONTEXT).subscribe({
    start(data) {
      const instance = data.arguments?.[0] as { constructor?: { name?: string } } | undefined;
      const callback = data.arguments?.[1];
      routerMeta.set(data, {
        instanceName: instance?.constructor?.name || 'UnnamedInstance',
        callbackName: typeof callback === 'function' ? callback.name : '',
        moduleVersion: data.moduleVersion,
      });
      if (typeof callback === 'function') {
        data.arguments[1] = wrapRouteHandler(callback as AnyFn, data.moduleVersion);
      }
    },
    end(data) {
      const handler = data.result;
      const meta = routerMeta.get(data);
      if (typeof handler === 'function' && meta && !isWrapped(handler as AnyFn)) {
        data.result = wrapRequestContextHandler(
          handler as AnyFn,
          meta.instanceName,
          meta.callbackName,
          meta.moduleVersion,
        );
      }
      routerMeta.delete(data);
    },
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error(data) {
      routerMeta.delete(data);
    },
  });

  // @Injectable (middleware/guard/pipe/interceptor) and @Catch
  // (exception filter): both decorators share the
  // `(target) => {...}` inner-arrow shape.
  const seenInterceptorContexts = new WeakSet<MinimalNestJsExecutionContext>();
  subscribeDecoratorChannel<InjectableTarget>(CHANNELS.NESTJS_INJECTABLE, target =>
    patchInjectableTarget(target, seenInterceptorContexts),
  );
  subscribeDecoratorChannel<CatchTarget>(CHANNELS.NESTJS_CATCH, patchCatchTarget);

  // @Cron/@Interval/@Timeout (schedule), @OnEvent (event), @Processor (bullmq)
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
