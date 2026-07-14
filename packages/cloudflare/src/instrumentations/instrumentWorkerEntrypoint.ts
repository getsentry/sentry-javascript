import type { Hono } from 'hono';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import type { CloudflareOptions } from '../client';
import { instrumentWorkerEntrypointFetch } from './worker/instrumentFetch';
import { instrumentWorkerEntrypointQueue } from './worker/instrumentQueue';
import { instrumentWorkerEntrypointScheduled } from './worker/instrumentScheduled';
import { instrumentWorkerEntrypointTail } from './worker/instrumentTail';
import { getFinalOptions } from '../options';
import { instrumentContext } from '../utils/instrumentContext';
import { instrumentEnv } from './worker/instrumentEnv';

export type WorkerEntrypointConstructor<Env = unknown, Props = {}> = new (
  ctx: ExecutionContext,
  env: Env,
) => InstanceType<typeof WorkerEntrypoint<Env, Props>>;

type ExtractHonoBindings<T> = T extends Hono<infer E>
  ? 'Bindings' extends keyof E
    ? E['Bindings']
    : never
  : never;

type ExtractFetchBindings<T> = T extends {
  fetch: (request: Request, env?: infer B, executionCtx?: ExecutionContext) => Response | Promise<Response>;
}
  ? Exclude<B, {}>
  : never;

type ExtractWorkerEntrypointEnv<T> = T extends abstract new (
  _ctx: ExecutionContext,
  env: infer E,
) => unknown
  ? E
  : never;

// oxlint-disable-next-line typescript/no-explicit-any
export type HandlerEnv<T> = T extends ExportedHandler<infer E, any, any>
  ? E
  : ExtractHonoBindings<T> extends never
    ? ExtractWorkerEntrypointEnv<T> extends never
      ? ExtractFetchBindings<T> extends never
        ? typeof cloudflareEnv
        : ExtractFetchBindings<T>
      : ExtractWorkerEntrypointEnv<T>
    : ExtractHonoBindings<T>;

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
export function instrumentWorkerEntrypoint<T extends WorkerEntrypointConstructor<any, any>>(
  optionsCallback: (env: HandlerEnv<T>) => CloudflareOptions | undefined,
  WorkerEntrypointClass: T,
): T {
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

      instrumentWorkerEntrypointFetch(obj, options, context);
      instrumentWorkerEntrypointScheduled(obj, options, context);
      instrumentWorkerEntrypointQueue(obj, options, context);
      instrumentWorkerEntrypointTail(obj, options, context);

      return obj;
    },
  });
}
