import type { ExportedHandler } from '@cloudflare/workers-types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import type { CloudflareOptions } from '../../client';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { wrapRequestHandler } from '../../request';
import { instrumentContext } from '../../utils/instrumentContext';
import { instrumentEnv } from './instrumentEnv';

/**
 * Instruments a fetch handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerFetch<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: typeof cloudflareEnv) => CloudflareOptions | undefined,
): void {
  if (!('fetch' in handler) || typeof handler.fetch !== 'function') {
    return;
  }

  handler.fetch = ensureInstrumented(
    handler.fetch,
    original =>
      new Proxy(original, {
        apply(target, thisArg, args: Parameters<NonNullable<T['fetch']>>) {
          const [request, env, ctx] = args;
          const context = instrumentContext(ctx);
          args[1] = instrumentEnv(env);
          args[2] = context;

          const options = getFinalOptions(optionsCallback(env), env);

          return wrapRequestHandler({ options, request, context }, () => target.apply(thisArg, args));
        },
      }),
  );
}

/**
 * Instruments a fetch method for WorkerEntrypoint (options/context already available).
 */
export function instrumentWorkerEntrypointFetch<T extends WorkerEntrypoint>(
  instance: T,
  options: CloudflareOptions,
  context: ExecutionContext,
): void {
  if (!instance.fetch) {
    return;
  }

  const original = instance.fetch.bind(instance);
  instance.fetch = new Proxy(original, {
    apply(target, thisArg, args: [Request]) {
      const [request] = args;

      return wrapRequestHandler({ options, request, context }, () => Reflect.apply(target, thisArg, args));
    },
  });
}
