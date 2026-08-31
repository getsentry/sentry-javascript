/* eslint-disable @typescript-eslint/unbound-method */
import { isObjectLike } from '@sentry/core';
import type { DurableObject } from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { getInstrumented, markAsInstrumented } from './instrument';
import { instrumentDurableObjectHandlers } from './instrumentations/instrumentDurableObjectHandlers';
import { instrumentEnv } from './instrumentations/worker/instrumentEnv';
import { getFinalOptions } from './options';
import { instrumentContext } from './utils/instrumentContext';
import { hasRpcMeta } from './utils/rpcMeta';
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
 * instrumentation — callers apply that last via {@link finalizeWithRpcInstrumentation}, after any
 * additional per-instance instrumentation has been layered onto the returned object.
 *
 * @internal
 */
export function constructInstrumentedDurableObject<E, T extends DurableObject<E>>(
  target: new (state: DurableObjectState, env: E) => T,
  ctx: DurableObjectState,
  env: E,
  newTarget: NewableFunction,
  optionsCallback: (env: E) => CloudflareOptions,
): {
  obj: T;
  options: CloudflareOptions;
  context: InstrumentedDurableObjectContext;
  frameworkManagedMethods: ReadonlySet<string>;
} {
  setAsyncLocalStorageAsyncContextStrategy();
  const options = getFinalOptions(optionsCallback(env), env);
  // See InstrumentedDurableObjectContext — `ctx` is widened to `any` so the concrete
  // `DurableObjectState` type never enters the checker's relation graph in this module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = instrumentContext(ctx as any);
  const instrumentedEnv = instrumentEnv(env as Record<string, unknown>, options);

  const prototype = (newTarget as unknown as { prototype?: object }).prototype ?? target.prototype;
  const cachedFrameworkManagedMethods = frameworkManagedMethodsCache.get(prototype);
  const methodsBeforeConstruction = cachedFrameworkManagedMethods ? undefined : resolvePrototypeMethods(prototype);

  // Pass `newTarget` so that subclasses of the instrumented class (e.g. the wrapper classes
  // created by wrangler's local dev tooling or `@cloudflare/vitest-pool-workers`) keep their
  // own prototype — otherwise subclass methods disappear and `instanceof` checks break.
  const obj = Reflect.construct(target, [context, instrumentedEnv], newTarget) as T;

  const frameworkManagedMethods = resolveFrameworkManagedMethods(
    prototype,
    obj,
    methodsBeforeConstruction,
    cachedFrameworkManagedMethods,
  );

  instrumentDurableObjectHandlers(obj, options, context);

  return { obj, options, context, frameworkManagedMethods };
}

const frameworkManagedMethodsCache = new WeakMap<object, ReadonlySet<string>>();

/**
 * Collects the methods visible from a prototype, using normal property lookup precedence.
 * Methods inherited from `Object.prototype` are excluded because they cannot be Durable Object RPC methods.
 */
function resolvePrototypeMethods(prototype: object | null): Map<string, unknown> {
  const methods = new Map<string, unknown>();

  for (let current = prototype; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    for (const name of Object.getOwnPropertyNames(current)) {
      // The first occurrence wins, mirroring what a property lookup on the instance would find
      if (name === 'constructor' || methods.has(name)) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(current, name);

      if (descriptor && typeof descriptor.value === 'function') {
        methods.set(name, descriptor.value);
      }
    }
  }

  return methods;
}

/**
 * Finds methods that a framework replaced while constructing the first instance.
 *
 * Some frameworks register methods by function identity, so replacing one of their wrappers would
 * break dispatch. The result is cached because frameworks commonly install their wrappers only
 * once; later constructions would no longer reveal which methods they manage.
 */
function resolveFrameworkManagedMethods(
  prototype: object,
  obj: object,
  methodsBeforeConstruction: Map<string, unknown> | undefined,
  cached: ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  if (cached) {
    return cached;
  }

  const methodsAfterConstruction = resolvePrototypeMethods(Object.getPrototypeOf(obj) as object);
  const managed = new Set<string>();

  for (const [name, method] of methodsAfterConstruction) {
    const before = methodsBeforeConstruction?.get(name);

    if (before && before !== method) {
      managed.add(name);
    }
  }

  frameworkManagedMethodsCache.set(prototype, managed);

  return managed;
}

type RpcInstanceState = {
  options: CloudflareOptions;
  context: InstrumentedDurableObjectContext;
  /**
   * Whether to trace calls that carry no RPC metadata. Only the deprecated
   * `instrumentPrototypeMethods` option does, because it predates metadata propagation.
   */
  alwaysTrace: boolean;
  /** Per-instance cache of the traced method wrappers, keyed by method name. Created on first use. */
  tracedMethods?: Map<string, UncheckedMethod>;
};

/**
 * Method names the runtime never dispatches over RPC, so wrapping them buys no tracing.
 *
 * Mirrors `isReservedName` in workerd (`src/workerd/api/worker-rpc.c++`): the runtime rejects these
 * before any property lookup happens. `fetch`, `alarm` and the `webSocket*` handlers are also
 * instrumented per-instance as own properties, and `constructor` is on every prototype.
 */
const RESERVED_RPC_METHOD_NAMES: ReadonlySet<string> = new Set([
  'constructor',
  'fetch',
  'connect',
  'alarm',
  'webSocketMessage',
  'webSocketClose',
  'webSocketError',
  'dup',
]);

// Prototype wrappers are shared by all instances, while SDK options and traced method caches are not.
const rpcInstanceStates = new WeakMap<object, RpcInstanceState>();

/**
 * Adds trace propagation to a constructed Durable Object's RPC methods.
 *
 * RPC methods are wrapped on the prototype because Cloudflare dispatches them with the Durable
 * Object instance as the receiver. This preserves native private-field access and keeps the methods
 * visible to Cloudflare's RPC dispatcher. Built-in handlers, Agent handlers, and methods managed by
 * another framework are left untouched.
 *
 * Call this after all per-instance instrumentation has been applied. If RPC trace propagation is
 * disabled, the object is returned unchanged.
 *
 * @param obj The constructed Durable Object instance.
 * @param options The resolved SDK options for this instance.
 * @param context The instrumented execution context for this instance.
 * @param excludedMethods Method names owned by another framework and therefore not safe to wrap.
 * @returns The same Durable Object instance, with eligible prototype methods instrumented.
 * @internal
 */
export function finalizeWithRpcInstrumentation<T extends object>(
  obj: T,
  options: CloudflareOptions,
  context: InstrumentedDurableObjectContext,
  excludedMethods?: ReadonlySet<string>,
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
  const allowedMethods = Array.isArray(options.instrumentPrototypeMethods)
    ? // eslint-disable-next-line typescript/no-deprecated
      new Set(options.instrumentPrototypeMethods)
    : undefined;

  // When using the deprecated `instrumentPrototypeMethods` option, always create spans.
  // When using the new `enableRpcTracePropagation`, only create spans when RPC metadata is present.
  // eslint-disable-next-line typescript/no-deprecated
  const alwaysTrace = options.enableRpcTracePropagation === undefined;

  rpcInstanceStates.set(obj, { options, context, alwaysTrace });

  instrumentPrototypeRpcMethods(obj, excludedMethods, allowedMethods);

  return obj;
}

/**
 * Returns a prototype method when it is eligible for RPC instrumentation.
 */
function getRpcMethodDescriptor(
  obj: object,
  prototype: object,
  methodName: string,
  excludedMethods?: ReadonlySet<string>,
  allowedMethods?: ReadonlySet<string>,
): PropertyDescriptor | undefined {
  if (
    RESERVED_RPC_METHOD_NAMES.has(methodName) ||
    Object.prototype.hasOwnProperty.call(obj, methodName) ||
    excludedMethods?.has(methodName) ||
    (allowedMethods && !allowedMethods.has(methodName))
  ) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);

  if (!descriptor || typeof descriptor.value !== 'function' || getInstrumented(descriptor.value)) {
    return undefined;
  }

  return descriptor;
}

/**
 * Wraps eligible methods on the instance's prototype chain once per class.
 *
 * Because the wrappers live on the prototype, the allow-list of the first constructed instance
 * decides which methods carry a wrapper for every later instance of that class. This only affects
 * the deprecated array form of `instrumentPrototypeMethods`, where differing options per instance
 * of the same class were never a supported configuration.
 */
function instrumentPrototypeRpcMethods(
  obj: object,
  excludedMethods?: ReadonlySet<string>,
  allowedMethods?: ReadonlySet<string>,
): void {
  let prototype: object | null = Object.getPrototypeOf(obj);

  while (prototype && prototype !== Object.prototype) {
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      const descriptor = getRpcMethodDescriptor(obj, prototype, methodName, excludedMethods, allowedMethods);

      if (!descriptor) {
        continue;
      }

      const wrapped = createRpcPrototypeWrapper(methodName, descriptor.value as UncheckedMethod);

      try {
        Object.defineProperty(prototype, methodName, { ...descriptor, value: wrapped });
      } catch {}

      // Only the wrapper is marked, not the original method: `wrapMethodWithSentry` resolves
      // through the same global map and must not resolve the original to this wrapper,
      // which would recurse.
      markAsInstrumented(wrapped);
    }

    prototype = Object.getPrototypeOf(prototype);
  }
}

/**
 * Creates a prototype wrapper that traces RPC calls carrying Sentry metadata.
 *
 * The wrapper looks up SDK state from its receiver, allowing one prototype function to serve every
 * instance. Calls without instance state use the original method directly, as do calls without RPC
 * metadata unless the instance opted into unconditional tracing. The original function name and
 * arity are preserved because frameworks may inspect them for dispatch.
 */
function createRpcPrototypeWrapper(methodName: string, originalMethod: UncheckedMethod): UncheckedMethod {
  const wrapper = function (this: unknown, ...args: unknown[]): unknown {
    const state = isObjectLike(this) ? rpcInstanceStates.get(this) : undefined;

    // Untraced calls are the common case — every internal call the instance makes to one of its
    // own methods lands here too, and those never carry RPC metadata.
    if (!state || (!state.alwaysTrace && !hasRpcMeta(args))) {
      return Reflect.apply(originalMethod, this, args);
    }

    const tracedMethods = (state.tracedMethods ??= new Map());
    let traced = tracedMethods.get(methodName);

    if (!traced) {
      traced = wrapMethodWithSentry(
        {
          options: state.options,
          context: state.context,
          spanName: methodName,
          spanOp: 'rpc',
          origin: 'auto.faas.cloudflare.durable_object',
        },
        originalMethod,
        undefined,
        true,
      );
      tracedMethods.set(methodName, traced);
    }

    return Reflect.apply(traced, this, args);
  };

  Object.defineProperties(wrapper, {
    name: { value: originalMethod.name, configurable: true },
    length: { value: originalMethod.length, configurable: true },
  });

  return wrapper as UncheckedMethod;
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
      const { obj, options, context, frameworkManagedMethods } = constructInstrumentedDurableObject(
        target,
        ctx,
        env,
        newTarget,
        optionsCallback,
      );

      return finalizeWithRpcInstrumentation(obj, options, context, frameworkManagedMethods);
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
      const { obj, options, context, frameworkManagedMethods } = constructInstrumentedDurableObject(
        target,
        ctx,
        env,
        newTarget,
        optionsCallback,
      );

      instrumentCloudflareAgent(obj);

      // Apply RPC prototype-method instrumentation last, so the Agent-specific own-property
      // handlers we just installed are excluded from RPC method tracing. Methods the Agent
      // framework installed itself are excluded too — `instrumentCloudflareAgent` traces those by
      // wrapping the dispatch instead of the method.
      return finalizeWithRpcInstrumentation(obj, options, context, frameworkManagedMethods);
    },
  });
}
