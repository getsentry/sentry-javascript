import type { RpcStub, WorkerEntrypoint } from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';
import type { CloudflareOptions } from '../client';
import { getFinalOptions } from '../options';
import { instrumentContext } from '../utils/instrumentContext';
import { extractRpcMeta } from '../utils/rpcMeta';
import { type UncheckedMethod, wrapMethodWithSentry } from '../wrapMethodWithSentry';
import { instrumentEnv } from './worker/instrumentEnv';
import { instrumentWorkerEntrypointFetch } from './worker/instrumentFetch';
import { instrumentWorkerEntrypointQueue } from './worker/instrumentQueue';
import { instrumentWorkerEntrypointScheduled } from './worker/instrumentScheduled';
import { instrumentWorkerEntrypointTail } from './worker/instrumentTail';

const WORKER_ENTRYPOINT_ORIGIN = 'auto.faas.cloudflare.worker_entrypoint';

type ReservedMethod =
  | Exclude<Extract<keyof WorkerEntrypoint, string>, '__WORKER_ENTRYPOINT_BRAND'>
  | Extract<keyof ExportedHandler, string>
  | Exclude<Extract<keyof RpcStub<(...args: unknown[]) => unknown>, string>, '__RPC_STUB_BRAND'>
  | 'constructor';

const RESERVED_METHODS = new Set<string>([
  'connect',
  'constructor',
  'dup',
  'email',
  'fetch',
  'queue',
  'scheduled',
  'tail',
  'tailStream',
  'test',
  'trace',
] satisfies ReservedMethod[]);

interface CachedMethod {
  source: UncheckedMethod;
  wrapped: UncheckedMethod;
}

export type WorkerEntrypointConstructor<Env = unknown, Props = {}> = new (
  ctx: ExecutionContext,
  // WorkerEntrypoint subclasses can define different `env` shapes, so this constructor must accept all of them.
  // oxlint-disable-next-line typescript/no-explicit-any
  env: any,
) => InstanceType<typeof WorkerEntrypoint<Env, Props>>;

function isPrototypeMethod(instance: object, prop: string, method: UncheckedMethod): boolean {
  let prototype = Object.getPrototypeOf(instance);

  while (prototype && prototype !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
    if (descriptor) {
      return descriptor.value === method;
    }
    prototype = Object.getPrototypeOf(prototype);
  }

  return false;
}

function bindToInstance(instance: object, proxy: object, method: UncheckedMethod): UncheckedMethod {
  return new Proxy(method, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg === proxy ? instance : thisArg, args);
    },
  });
}

function instrumentMethod(
  instance: object,
  proxy: object,
  prop: PropertyKey,
  method: UncheckedMethod,
  options: CloudflareOptions,
  context: ExecutionContext,
): UncheckedMethod {
  const ownDescriptor = Object.getOwnPropertyDescriptor(instance, prop);
  if (ownDescriptor && 'value' in ownDescriptor && !ownDescriptor.configurable && !ownDescriptor.writable) {
    return method;
  }

  const boundMethod = bindToInstance(instance, proxy, method);

  if (typeof prop !== 'string' || RESERVED_METHODS.has(prop) || !isPrototypeMethod(instance, prop, method)) {
    return boundMethod;
  }

  const captureMethod = wrapMethodWithSentry(
    { options, context, spanOp: 'rpc', origin: WORKER_ENTRYPOINT_ORIGIN },
    boundMethod,
    undefined,
    true,
  );

  if (!options.enableRpcTracePropagation) {
    return captureMethod;
  }

  const tracedMethod = wrapMethodWithSentry(
    { options, context, spanName: prop, spanOp: 'rpc', origin: WORKER_ENTRYPOINT_ORIGIN },
    boundMethod,
    undefined,
    true,
  );

  return (...args: unknown[]) => {
    const { rpcMeta } = extractRpcMeta(args);
    return rpcMeta ? tracedMethod.call(proxy, ...args) : captureMethod.call(proxy, ...args);
  };
}

/**
 * Instruments a WorkerEntrypoint class to capture errors and performance data.
 *
 * Instruments the following methods (same as `withSentry` for ExportedHandler):
 * - fetch (HTTP requests)
 * - scheduled (cron triggers)
 * - queue (queue consumers)
 * - email (email handlers)
 * - tail (tail workers)
 *
 * as well as any other public RPC methods on the WorkerEntrypoint instance.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param WorkerEntrypointClass The WorkerEntrypoint class to instrument.
 * @returns The instrumented WorkerEntrypoint class.
 *
 * @example
 * ```ts
 * class MyWorkerBase extends WorkerEntrypoint<Env> {
 *   async fetch(request: Request): Promise<Response> {
 *     return new Response('Hello World!');
 *   }
 *
 *   async myRpcMethod(arg: string): Promise<string> {
 *     return `Hello ${arg}!`;
 *   }
 * }
 *
 * export default instrumentWorkerEntrypoint(
 *   env => ({
 *     dsn: env.SENTRY_DSN,
 *     tracesSampleRate: 1.0,
 *   }),
 *   MyWorkerBase,
 * );
 * ```
 */
export function instrumentWorkerEntrypoint<
  Env,
  Props,
  T extends InstanceType<typeof WorkerEntrypoint<Env, Props>>,
  C extends new (ctx: ExecutionContext, env: Env) => T,
>(optionsCallback: (env: Env) => CloudflareOptions | undefined, WorkerEntrypointClass: C): C {
  // Set up AsyncLocalStorage strategy ONCE at instrumentation time, not per-request
  // This is critical - calling this per-request would create a new AsyncLocalStorage
  // each time, breaking scope isolation for concurrent requests
  setAsyncLocalStorageAsyncContextStrategy();

  return new Proxy(WorkerEntrypointClass, {
    construct(target, [ctx, env]) {
      const context = instrumentContext(ctx);
      const options = getFinalOptions(optionsCallback(env), env);
      const instrumentedEnv = instrumentEnv(env, options);
      const obj = new target(context, instrumentedEnv);

      // Override this.ctx to ensure the instrumented context is used
      // This is necessary because the base WorkerEntrypoint class sets this.ctx
      // from the constructor parameter, but we want users accessing this.ctx
      // to get the instrumented version
      if ('ctx' in obj) {
        Object.defineProperty(obj, 'ctx', {
          value: context,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      if ('env' in obj) {
        Object.defineProperty(obj, 'env', {
          value: instrumentedEnv,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      Object.defineProperty(obj, '__SENTRY_CONTEXT__', {
        value: context,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      Object.defineProperty(obj, '__SENTRY_OPTIONS__', {
        value: options,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      const entrypoint = obj as WorkerEntrypoint;
      instrumentWorkerEntrypointFetch(entrypoint, options, context);
      instrumentWorkerEntrypointScheduled(entrypoint, options, context);
      instrumentWorkerEntrypointQueue(entrypoint, options, context);
      instrumentWorkerEntrypointTail(entrypoint, options, context);

      // workerd resolves RPC methods through property access.
      const methodCache = new Map<PropertyKey, CachedMethod>();

      const proxy: typeof obj = new Proxy(obj, {
        get(instance, prop) {
          const value = Reflect.get(instance, prop, instance);

          if (typeof value !== 'function') {
            return value;
          }

          const method = value as UncheckedMethod;

          const cached = methodCache.get(prop);
          if (cached?.source === method) {
            return cached.wrapped;
          }

          const wrapped = instrumentMethod(instance, proxy, prop, method, options, context);
          methodCache.set(prop, { source: method, wrapped });
          return wrapped;
        },
      });

      return proxy;
    },
  });
}
