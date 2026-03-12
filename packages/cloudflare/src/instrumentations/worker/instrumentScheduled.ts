import type { ExportedHandler, ScheduledController } from '@cloudflare/workers-types';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { isInstrumented, markAsInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';

/**
 * Core scheduled handler logic - wraps execution with Sentry instrumentation.
 */
function wrapScheduledHandler(
  controller: ScheduledController,
  options: CloudflareOptions,
  context: ExecutionContext,
  fn: () => unknown,
): unknown {
  return withIsolationScope(isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    const client = init({ ...options, ctx: context });
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
  optionsCallback: (env: Parameters<NonNullable<T['scheduled']>>[1]) => CloudflareOptions | undefined,
): void {
  if (!('scheduled' in handler) || typeof handler.scheduled !== 'function' || isInstrumented(handler.scheduled)) {
    return;
  }

  handler.scheduled = new Proxy(handler.scheduled, {
    apply(target, thisArg, args: Parameters<NonNullable<T['scheduled']>>) {
      const [controller, env, ctx] = args;
      const context = instrumentContext(ctx);
      args[2] = context;

      const options = getFinalOptions(optionsCallback(env), env);

      return wrapScheduledHandler(controller, options, context, () => target.apply(thisArg, args));
    },
  });

  markAsInstrumented(handler.scheduled);
}
