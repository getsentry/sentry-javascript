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
import {
  captureCheckIn,
  captureException,
  hasSpanStreamingEnabled,
  startSpan,
  timestampInSeconds,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { setInvocationState } from '../../utils/invocationContext';
import { instrumentEnv } from './instrumentEnv';

const MAX_MONITOR_SLUG_LENGTH = 50;

/**
 * Derives a monitor slug from a cron expression, e.g. `30 9 * * 1-5` -> `cron-30-9-x-x-1-5`.
 */
function cronToMonitorSlug(cron: string): string {
  const expression = cron
    .toLowerCase()
    .replace(/\*/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `cron-${expression}`.slice(0, MAX_MONITOR_SLUG_LENGTH).replace(/-+$/, '');
}

// Check-ins are captured directly rather than through `withMonitor`, which would fork the
// isolation scope and lose the invocation state attached to it.
function startCronCheckIn(
  cron: string,
  monitorCronTriggers: CloudflareOptions['monitorCronTriggers'],
): ((status: 'ok' | 'error') => void) | undefined {
  if (!monitorCronTriggers) {
    return undefined;
  }

  const monitorSlug = typeof monitorCronTriggers === 'function' ? monitorCronTriggers(cron) : cronToMonitorSlug(cron);
  if (!monitorSlug) {
    return undefined;
  }

  const checkInId = captureCheckIn(
    { monitorSlug, status: 'in_progress' },
    { schedule: { type: 'crontab', value: cron } },
  );
  const startTime = timestampInSeconds();

  return status => {
    captureCheckIn({ monitorSlug, status, checkInId, duration: timestampInSeconds() - startTime });
  };
}

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
        let finishCheckIn: ReturnType<typeof startCronCheckIn>;
        try {
          finishCheckIn = startCronCheckIn(controller.cron, options.monitorCronTriggers);
          const result = await fn();
          finishCheckIn?.('ok');
          return result;
        } catch (e) {
          finishCheckIn?.('error');
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
