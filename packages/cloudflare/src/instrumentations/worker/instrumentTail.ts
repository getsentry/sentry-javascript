import type { ExportedHandler, TraceItem } from '@cloudflare/workers-types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import { captureException, withIsolationScope } from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose, makeFlushLock } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { instrumentEnv } from './instrumentEnv';

/**
 * Core tail handler logic - wraps execution with Sentry instrumentation.
 * Note: tail handlers don't create spans, just error capture.
 */
function wrapTailHandler(options: CloudflareOptions, context: ExecutionContext, fn: () => unknown): unknown {
  return withIsolationScope(async isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    // Create flush lock per-request to track waitUntil promises
    const flushLock = makeFlushLock(context);

    const client = init(options);
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    try {
      return await fn();
    } catch (e) {
      captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.tail' } });
      throw e;
    } finally {
      waitUntil(
        (async () => {
          await flushLock.finalize();
          await flushAndDispose(client);
        })(),
      );
    }
  });
}

/**
 * Instruments a tail handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerTail<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: typeof cloudflareEnv) => CloudflareOptions | undefined,
): void {
  if (!('tail' in handler) || typeof handler.tail !== 'function') {
    return;
  }

  handler.tail = ensureInstrumented(
    handler.tail,
    original =>
      new Proxy(original, {
        apply(target, thisArg, args: Parameters<NonNullable<T['tail']>>) {
          const [, env, ctx] = args;
          const context = instrumentContext(ctx);
          args[1] = instrumentEnv(env);
          args[2] = context;

          const options = getFinalOptions(optionsCallback(env), env);

          return wrapTailHandler(options, context, () => target.apply(thisArg, args));
        },
      }),
  );
}

/**
 * Instruments a tail method for WorkerEntrypoint (options/context already available).
 */
export function instrumentWorkerEntrypointTail<T extends WorkerEntrypoint>(
  instance: T,
  options: CloudflareOptions,
  context: ExecutionContext,
): void {
  if (!instance.tail) {
    return;
  }

  const original = instance.tail.bind(instance);
  instance.tail = new Proxy(original, {
    apply(target, thisArg, args: [TraceItem[]]) {
      return wrapTailHandler(options, context, () => Reflect.apply(target, thisArg, args));
    },
  });
}
