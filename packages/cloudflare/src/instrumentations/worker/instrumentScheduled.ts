import type { ExportedHandler, ScheduledController } from '@cloudflare/workers-types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { instrumentEnv } from './instrumentEnv';

function wrapScheduledHandler(
  controller: ScheduledController,
  options: CloudflareOptions,
  context: ExecutionContext,
  fn: () => unknown,
): unknown {
  return withIsolationScope(isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    const client = init(options);
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    return startSpan(
      {
        op: 'faas.cron',
        name: `Scheduled Cron ${controller.cron}`,
        attributes: {
          'faas.cron': controller.cron,
          'faas.time': new Date(controller.scheduledTime).toISOString(),
          'faas.trigger': 'timer',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.scheduled',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        },
      },
      async () => {
        try {
          return await fn();
        } catch (e) {
          captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.scheduled' } });
          throw e;
        } finally {
          waitUntil(flushAndDispose(client));
        }
      },
    );
  });
}

/**
 * Instruments a scheduled handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerScheduled<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: typeof cloudflareEnv) => CloudflareOptions | undefined,
): void {
  if (!('scheduled' in handler) || typeof handler.scheduled !== 'function') {
    return;
  }

  handler.scheduled = ensureInstrumented(
    handler.scheduled,
    original =>
      new Proxy(original, {
        apply(target, thisArg, args: Parameters<NonNullable<T['scheduled']>>) {
          const [controller, env, ctx] = args;
          const context = instrumentContext(ctx);
          args[1] = instrumentEnv(env);
          args[2] = context;

          const options = getFinalOptions(optionsCallback(env), env);

          return wrapScheduledHandler(controller, options, context, () => target.apply(thisArg, args));
        },
      }),
  );
}

/**
 * Instruments a scheduled method for WorkerEntrypoint (options/context already available).
 */
export function instrumentWorkerEntrypointScheduled<T extends WorkerEntrypoint>(
  instance: T,
  options: CloudflareOptions,
  context: ExecutionContext,
): void {
  if (!instance.scheduled) {
    return;
  }

  const original = instance.scheduled.bind(instance);
  instance.scheduled = new Proxy(original, {
    apply(target, thisArg, args: [ScheduledController]) {
      const [controller] = args;

      return wrapScheduledHandler(controller, options, context, () => Reflect.apply(target, thisArg, args));
    },
  });
}
