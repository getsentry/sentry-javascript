import type { ScheduledController } from '@cloudflare/workers-types';
import type { AnyExportedHandler } from '../../types';
import type { env as cloudflareEnv, WorkerEntrypoint } from 'cloudflare:workers';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  CODE_FUNCTION_NAME,
  SENTRY_OP,
  FAAS_CRON,
  FAAS_TIME,
  FAAS_TRIGGER,
  SENTRY_DESCRIPTION,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import { captureException, hasSpanStreamingEnabled, startSpan, withIsolationScope } from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { setInvocationState } from '../../utils/invocationContext';
import { instrumentEnv } from './instrumentEnv';

function wrapScheduledHandler(
  controller: ScheduledController,
  options: CloudflareOptions,
  context: ExecutionContext,
  fn: () => unknown,
): unknown {
  return withIsolationScope(isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    setInvocationState(isolationScope, { ctx: context });

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    const description = `Scheduled Cron ${controller.cron}`;

    return startSpan(
      {
        name: client && hasSpanStreamingEnabled(client) ? 'scheduled' : description,
        attributes: {
          [SENTRY_OP]: FUNCTION,
          // override description inference by Relay to preserve the original (transaction-based) description.
          // sentry-conventions can't map the special case for the "Scheduled Cron" prefix and the chron string.
          [SENTRY_DESCRIPTION]: description,
          [CODE_FUNCTION_NAME]: 'scheduled',
          [FAAS_CRON]: controller.cron,
          [FAAS_TIME]: new Date(controller.scheduledTime).toISOString(),
          [FAAS_TRIGGER]: 'timer',
          [SENTRY_ORIGIN]: 'auto.faas.cloudflare.scheduled',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'task',
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
export function instrumentExportedHandlerScheduled<T extends AnyExportedHandler>(
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
          const options = getFinalOptions(optionsCallback(env), env);
          args[1] = instrumentEnv(env, options);
          args[2] = context;

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
