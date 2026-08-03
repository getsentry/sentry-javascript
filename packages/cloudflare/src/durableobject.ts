/* eslint-disable @typescript-eslint/unbound-method */
import { captureException } from '@sentry/core';
import type { DurableObject } from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import type { CloudflareOptions } from './client';
import { ensureInstrumented } from './instrument';
import { instrumentEnv } from './instrumentations/worker/instrumentEnv';
import { getFinalOptions } from './options';
import { wrapRequestHandlerWithInit } from './request';
import { init } from './sdk';
import { instrumentContext } from './utils/instrumentContext';
import { extractRpcMeta } from './utils/rpcMeta';
import { getEffectiveRpcPropagation } from './utils/rpcOptions';
import { instrumentCloudflareAgent } from './instrumentations/agents';
import { type UncheckedMethod, wrapMethodWithSentry } from './wrapMethodWithSentry';

/**
 * The instrumented context passed between the shared construction helpers.
 *
 * This is intentionally `any` rather than `ReturnType<typeof instrumentContext<DurableObjectState>>`.
 * A concrete `DurableObjectState` here forces `tsc` to structurally relate its `storage: SqlStorage`
 * graph against the `ExecutionContext | InstrumentedDurableObjectState` parameter of
 * `wrapMethodWithSentry`, while the RPC-branded `DurableObject` from `cloudflare:workers` is also in
 * scope. That union comparison explodes (1296×1296) and hangs the type build. The original inline
 * implementation avoided this only incidentally, because `ctx` reached it as `any` through the Proxy
 * `construct` trap. Keeping the shared context `any` preserves that behavior.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InstrumentedDurableObjectContext = any;

/**
 * Constructs a Durable Object instance and instruments its built-in handler methods
 * (`fetch`, `alarm`, `webSocketMessage`, `webSocketClose`, `webSocketError`).
 *
 * This is the shared construction path used by both {@link instrumentDurableObjectWithSentry}
 * and {@link instrumentAgentWithSentry}. It intentionally does NOT apply the RPC prototype-method
 * proxy — callers apply that last via {@link finalizeWithRpcInstrumentation}, after any additional
 * per-instance instrumentation has been layered onto the returned object.
 *
 * @internal
 */
export function constructInstrumentedDurableObject<E, T extends DurableObject<E>>(
  target: new (state: DurableObjectState, env: E) => T,
  ctx: DurableObjectState,
  env: E,
  newTarget: NewableFunction,
  optionsCallback: (env: E) => CloudflareOptions,
): { obj: T; options: CloudflareOptions; context: InstrumentedDurableObjectContext } {
  setAsyncLocalStorageAsyncContextStrategy();
  const options = getFinalOptions(optionsCallback(env), env);
  // See InstrumentedDurableObjectContext — `ctx` is widened to `any` so the concrete
  // `DurableObjectState` type never enters the checker's relation graph in this module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = instrumentContext(ctx as any);
  const instrumentedEnv = instrumentEnv(env as Record<string, unknown>, options);

  // Pass `newTarget` so that subclasses of the instrumented class (e.g. the wrapper classes
  // created by wrangler's local dev tooling or `@cloudflare/vitest-pool-workers`) keep their
  // own prototype — otherwise subclass methods disappear and `instanceof` checks break.
  const obj = Reflect.construct(target, [context, instrumentedEnv], newTarget) as T;

  instrumentDurableObjectHandlers(obj, options, context);

  return { obj, options, context };
}

/**
 * Instruments the built-in Durable Object handler methods on a constructed instance.
 *
 * These are the methods that are available on a Durable Object
 * ref: https://developers.cloudflare.com/durable-objects/api/base/
 * - obj.alarm
 * - obj.fetch
 * - obj.webSocketError
 * - obj.webSocketClose
 * - obj.webSocketMessage
 *
 * Any other public methods on the Durable Object instance are RPC calls.
 */
function instrumentDurableObjectHandlers<E, T extends DurableObject<E>>(
  obj: T,
  options: CloudflareOptions,
  context: InstrumentedDurableObjectContext,
): void {
  // Bind each built-in handler to this instance before wrapping.
  // See https://github.com/getsentry/sentry-javascript/issues/22328
  if (obj.fetch && typeof obj.fetch === 'function') {
    obj.fetch = ensureInstrumented(
      obj.fetch.bind(obj),
      original =>
        new Proxy(original, {
          apply(target, thisArg, args) {
            return wrapRequestHandlerWithInit(
              { options, request: args[0], context },
              () => {
                return Reflect.apply(target, thisArg, args);
              },
              init,
            );
          },
        }),
    );
  }

  if (obj.alarm && typeof obj.alarm === 'function') {
    // Alarms are independent invocations, so we start a new trace and link to the previous alarm
    obj.alarm = wrapMethodWithSentry(
      {
        options,
        context,
        spanName: 'alarm',
        spanOp: 'function',
        startNewTrace: true,
        origin: 'auto.faas.cloudflare.durable_object',
      },
      obj.alarm.bind(obj),
    );
  }

  if (obj.webSocketMessage && typeof obj.webSocketMessage === 'function') {
    obj.webSocketMessage = wrapMethodWithSentry(
      { options, context, spanName: 'webSocketMessage', origin: 'auto.faas.cloudflare.durable_object' },
      obj.webSocketMessage.bind(obj),
    );
  }

  if (obj.webSocketClose && typeof obj.webSocketClose === 'function') {
    obj.webSocketClose = wrapMethodWithSentry(
      { options, context, spanName: 'webSocketClose', origin: 'auto.faas.cloudflare.durable_object' },
      obj.webSocketClose.bind(obj),
    );
  }

  if (obj.webSocketError && typeof obj.webSocketError === 'function') {
    obj.webSocketError = wrapMethodWithSentry(
      { options, context, spanName: 'webSocketError', origin: 'auto.faas.cloudflare.durable_object' },
      obj.webSocketError.bind(obj),
      (_, error) =>
        captureException(error, {
          mechanism: {
            type: 'auto.faas.cloudflare.durable_object_websocket',
            handled: false,
          },
        }),
    );
  }
}

/**
 * Wraps a constructed (and already handler-instrumented) Durable Object instance with the RPC
 * prototype-method proxy, when RPC trace propagation is enabled. Returns the object unchanged when
 * RPC instrumentation is disabled.
 *
 * This must be applied last, so that any per-instance instrumentation (own properties such as
 * `fetch`, `alarm`, or Agent-specific handlers) is excluded from RPC method tracing.
 *
 * @internal
 */
export function finalizeWithRpcInstrumentation<T extends object>(
  obj: T,
  options: CloudflareOptions,
  context: InstrumentedDurableObjectContext,
): T {
  // Get effective RPC propagation setting (handles deprecation of instrumentPrototypeMethods)
  const rpcPropagation = getEffectiveRpcPropagation(options);

  // Skip RPC instrumentation if not enabled
  if (!rpcPropagation) {
    return obj;
  }

  // If `instrumentPrototypeMethods` was passed as an array (deprecated),
  // only the listed method names should be instrumented.
  // eslint-disable-next-line typescript/no-deprecated
  const instrumentPrototypeMethods = Array.isArray(options.instrumentPrototypeMethods)
    ? // eslint-disable-next-line typescript/no-deprecated
      options.instrumentPrototypeMethods
    : undefined;
  const allowSet = instrumentPrototypeMethods ? new Set(instrumentPrototypeMethods) : null;

  // When using the deprecated `instrumentPrototypeMethods` option, always create spans.
  // When using the new `enableRpcTracePropagation`, only create spans when RPC metadata is present.
  const alwaysTrace = options.enableRpcTracePropagation === undefined;

  // Return a Proxy that binds all methods to the original object and creates spans
  // for RPC calls that have Sentry trace context propagated.
  // Binding is required because frameworks may use private fields (babel WeakMap pattern),
  // which fail if `this` is the Proxy instead of the original object.
  const methodCache = new Map<string, UncheckedMethod>();

  return new Proxy(obj, {
    get(proxyTarget, prop, receiver) {
      const value = Reflect.get(proxyTarget, prop, receiver);

      if (typeof prop !== 'string' || typeof value !== 'function' || prop === 'constructor') {
        return value;
      }

      const cached = methodCache.get(prop);

      if (cached) {
        return cached;
      }

      const boundMethod = (value as UncheckedMethod).bind(proxyTarget);

      if (
        prop in Object.prototype ||
        Object.prototype.hasOwnProperty.call(proxyTarget, prop) ||
        (allowSet && !allowSet.has(prop))
      ) {
        methodCache.set(prop, boundMethod);

        return boundMethod;
      }

      // Pre-create the traced version
      const tracedMethod = wrapMethodWithSentry(
        { options, context, spanName: prop, spanOp: 'rpc', origin: 'auto.faas.cloudflare.durable_object' },
        boundMethod,
        undefined,
        true,
      );

      // For deprecated `instrumentPrototypeMethods`, always trace.
      // For new `enableRpcTracePropagation`, only trace when RPC metadata is present.
      if (alwaysTrace) {
        methodCache.set(prop, tracedMethod);

        return tracedMethod;
      }

      // Wrapper that checks for Sentry RPC metadata at call time
      const wrappedMethod = ((...args: unknown[]) => {
        const { rpcMeta } = extractRpcMeta(args);

        // If Sentry RPC metadata is present, use the traced version (creates span)
        // Otherwise, call the bound method directly (no span)
        return rpcMeta ? tracedMethod(...args) : boundMethod(...args);
      }) as UncheckedMethod;

      methodCache.set(prop, wrappedMethod);

      return wrappedMethod;
    },
  });
}

/**
 * Instruments a Durable Object class to capture errors and performance data.
 *
 * Instruments the following methods by default:
 * - fetch
 * - alarm
 * - webSocketMessage
 * - webSocketClose
 * - webSocketError
 *
 * To instrument RPC methods (prototype methods), enable the `enableRpcTracePropagation` option.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param DurableObjectClass The Durable Object class to instrument.
 * @returns The instrumented Durable Object class.
 *
 * @example
 * ```ts
 * class MyDurableObjectBase extends DurableObject {
 *   constructor(ctx: DurableObjectState, env: Env) {
 *     super(ctx, env);
 *   }
 * }
 *
 * export const MyDurableObject = instrumentDurableObjectWithSentry(
 *   env => ({
 *     dsn: env.SENTRY_DSN,
 *     tracesSampleRate: 1.0,
 *   }),
 *   MyDurableObjectBase,
 * );
 * ```
 */
export function instrumentDurableObjectWithSentry<
  E,
  T extends DurableObject<E>,
  C extends new (state: DurableObjectState, env: E) => T,
>(optionsCallback: (env: E) => CloudflareOptions, DurableObjectClass: C): C {
  return new Proxy(DurableObjectClass, {
    construct(target, [ctx, env], newTarget) {
      const { obj, options, context } = constructInstrumentedDurableObject(
        target,
        ctx,
        env,
        newTarget,
        optionsCallback,
      );

      return finalizeWithRpcInstrumentation(obj, options, context);
    },
  });
}

/**
 * Instruments a Cloudflare [`agents`](https://www.npmjs.com/package/agents) Agent class with Sentry.
 *
 * An `Agent` is a Durable Object under the hood, so this applies the same instrumentation as
 * {@link instrumentDurableObjectWithSentry} (request transactions, `alarm`, WebSocket handlers, RPC
 * trace propagation, SQL spans) and additionally captures Agent-specific telemetry via
 * `instrumentCloudflareAgent`:
 *
 * - **Callable RPC spans** — a span (op `rpc`) for each `@callable()` method invoked over WebSocket.
 * - **Breadcrumbs** — for every Agent observability event (`rpc`, `state:update`, `connect`,
 *   `disconnect`, `schedule:*`, `queue:*`, `workflow:*`, `email:*`, `mcp:*`, ...).
 *
 * Cloudflare Workers cannot auto-instrument, so the Agent class must be wrapped manually.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param AgentClass The Agent class to instrument.
 * @returns The instrumented Agent class.
 *
 * @example
 * ```ts
 * import { Agent, callable, routeAgentRequest } from 'agents';
 * import * as Sentry from '@sentry/cloudflare';
 *
 * class MyAgentBase extends Agent<Env> {
 *   @callable()
 *   async greet(name: string): Promise<string> {
 *     return `Hello, ${name}!`;
 *   }
 * }
 *
 * export const MyAgent = Sentry.instrumentAgentWithSentry(
 *   env => ({
 *     dsn: env.SENTRY_DSN,
 *     tracesSampleRate: 1.0,
 *     enableRpcTracePropagation: true,
 *   }),
 *   MyAgentBase,
 * );
 * ```
 */
export function instrumentAgentWithSentry<
  E,
  T extends DurableObject<E>,
  C extends new (state: DurableObjectState, env: E) => T,
>(optionsCallback: (env: E) => CloudflareOptions, AgentClass: C): C {
  return new Proxy(AgentClass, {
    construct(target, [ctx, env], newTarget) {
      const { obj, options, context } = constructInstrumentedDurableObject(
        target,
        ctx,
        env,
        newTarget,
        optionsCallback,
      );

      instrumentCloudflareAgent(obj);

      // Apply RPC prototype-method instrumentation last, so the Agent-specific own-property
      // handlers we just installed are excluded from RPC method tracing.
      return finalizeWithRpcInstrumentation(obj, options, context);
    },
  });
}
