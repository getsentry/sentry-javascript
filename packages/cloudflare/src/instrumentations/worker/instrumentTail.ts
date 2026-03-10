import type { ExportedHandler } from '@cloudflare/workers-types';
import { captureException, withIsolationScope } from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { isInstrumented, markAsInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';

/**
 * Core tail handler logic - wraps execution with Sentry instrumentation.
 * Note: tail handlers don't create spans, just error capture.
 */
function wrapTailHandler(options: CloudflareOptions, context: ExecutionContext, fn: () => unknown): unknown {
  return withIsolationScope(async isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    try {
      return await fn();
    } catch (e) {
      captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.tail' } });
      throw e;
    } finally {
      waitUntil(flushAndDispose(client));
    }
  });
}

/**
 * Instruments a tail handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerTail<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: Parameters<NonNullable<T['tail']>>[1]) => CloudflareOptions | undefined,
): void {
  if (!('tail' in handler) || typeof handler.tail !== 'function' || isInstrumented(handler.tail)) {
    return;
  }

  handler.tail = new Proxy(handler.tail, {
    apply(target, thisArg, args: Parameters<NonNullable<T['tail']>>) {
      const [, env, ctx] = args;
      const context = instrumentContext(ctx);
      args[2] = context;

      const options = getFinalOptions(optionsCallback(env), env);

      return wrapTailHandler(options, context, () => target.apply(thisArg, args));
    },
  });

  markAsInstrumented(handler.tail);
}
