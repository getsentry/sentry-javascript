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
import type { MonitorConfig } from '@sentry/core';
import {
  captureCheckIn,
  captureException,
  debug,
  hasSpanStreamingEnabled,
  startSpan,
  timestampInSeconds,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions, CronTriggerMonitorSettings } from '../../client';
import { DEBUG_BUILD } from '../../debug-build';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { setInvocationState } from '../../utils/invocationContext';
import { instrumentEnv } from './instrumentEnv';

const MAX_MONITOR_SLUG_LENGTH = 50;
const SLUG_HASH_LENGTH = 6;

/**
 * Derives a monitor slug from a cron expression, e.g. `30 9 * * 1-5` -> `cron-30-9-x-x-1to5`.
 *
 * Fields are joined with `-`, and `*`, `,`, `-` and `/` are written as `x`, `_`, `to` and `by`.
 * A hash of the expression is appended when it has any other characters or the slug is too long,
 * so different expressions don't share a slug.
 */
function cronToMonitorSlug(cron: string): string {
  const expression = cron.trim().toLowerCase().split(/\s+/).join(' ');
  const readable = expression.replace(/[ *,\-/]/g, char => SLUG_TOKENS[char] as string);
  const slug = `cron-${readable}`;

  if (/^[a-z0-9_-]+$/.test(readable) && slug.length <= MAX_MONITOR_SLUG_LENGTH) {
    return slug;
  }

  const prefix = slug
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, MAX_MONITOR_SLUG_LENGTH - SLUG_HASH_LENGTH - 1)
    .replace(/[-_]+$/, '');
  return `${prefix}-${hashString(expression)}`;
}

const SLUG_TOKENS: Record<string, string> = { ' ': '-', '*': 'x', ',': '_', '-': 'to', '/': 'by' };

// A polynomial string hash modulo 2^31 - 1, as a fixed-length base 36 string.
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return hash.toString(36).padStart(SLUG_HASH_LENGTH, '0');
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function weekdayIndex(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    const day = Number(value);
    // Cloudflare numbers weekdays from 1 = Sunday to 7 = Saturday.
    return day >= 1 && day <= 7 ? day - 1 : undefined;
  }
  const index = WEEKDAYS.indexOf(value.toUpperCase());
  return index === -1 ? undefined : index;
}

function convertWeekdayItem(item: string): string | undefined {
  const last = item.match(/^(\w+)L$/i);
  if (last) {
    const day = weekdayIndex(last[1] as string);
    return day === undefined ? undefined : `${day}L`;
  }

  const nth = item.match(/^(\w+)#([1-5])$/);
  if (nth) {
    const day = weekdayIndex(nth[1] as string);
    return day === undefined ? undefined : `${WEEKDAYS[day]}#${nth[2]}`;
  }

  const range = item.match(/^(\*|\w+)(?:-(\w+))?(?:\/(\d+))?$/);
  if (!range) {
    return undefined;
  }
  const [, from, to, step] = range;
  if (step !== undefined && !(Number(step) > 0)) {
    return undefined;
  }

  if (from === '*') {
    if (to !== undefined) {
      return undefined;
    }
    return step === undefined ? '*' : `SUN-SAT/${step}`;
  }

  const start = weekdayIndex(from as string);
  // A step without an end runs to Saturday, so it is written as a range.
  const end = to !== undefined ? weekdayIndex(to) : step !== undefined ? 6 : start;
  if (start === undefined || end === undefined || end < start) {
    return undefined;
  }

  // A step over a single day would run on to Sunday in Sentry's cron parser, so it is left out.
  if (start === end) {
    return WEEKDAYS[start];
  }
  const days = `${WEEKDAYS[start]}-${WEEKDAYS[end]}`;
  return step === undefined ? days : `${days}/${step}`;
}

/**
 * Converts a Cloudflare cron expression into a crontab Sentry accepts, which numbers weekdays from
 * 0 = Sunday. Returns `undefined` if the weekday field can't be converted.
 */
function cloudflareCronToCrontab(cron: string): string | undefined {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return undefined;
  }

  const weekdays: string[] = [];
  for (const item of (fields[4] as string).split(',')) {
    const converted = convertWeekdayItem(item);
    if (converted === undefined) {
      return undefined;
    }
    weekdays.push(converted);
  }

  return [...fields.slice(0, 4), weekdays.join(',')].join(' ');
}

interface CronTriggerMonitor {
  monitorSlug: string;
  monitorConfig: MonitorConfig | undefined;
}

function getCronTriggerMonitor(
  cron: string,
  monitorCronTriggers: CloudflareOptions['monitorCronTriggers'],
): CronTriggerMonitor | undefined {
  // Manual runs, e.g. through `wrangler dev --test-scheduled`, can have no cron expression.
  if (!monitorCronTriggers || !cron) {
    return undefined;
  }

  let monitor: string | CronTriggerMonitorSettings | undefined;
  try {
    monitor = typeof monitorCronTriggers === 'function' ? monitorCronTriggers(cron) : cronToMonitorSlug(cron);
  } catch (e) {
    DEBUG_BUILD && debug.warn(`[Cron Triggers] \`monitorCronTriggers\` threw for "${cron}", sending no check-ins:`, e);
    return undefined;
  }
  if (!monitor) {
    return undefined;
  }

  const { slug: monitorSlug, ...monitorSettings } = typeof monitor === 'string' ? { slug: monitor } : monitor;
  if (!monitorSlug) {
    return undefined;
  }

  const crontab = cloudflareCronToCrontab(cron);
  if (!crontab) {
    DEBUG_BUILD &&
      debug.warn(`[Cron Triggers] Can't convert "${cron}" to a Sentry schedule, sending check-ins without one.`);
  }

  return {
    monitorSlug,
    monitorConfig: crontab ? { ...monitorSettings, schedule: { type: 'crontab', value: crontab } } : undefined,
  };
}

// Check-ins are captured directly rather than through `withMonitor`, which would fork the
// isolation scope and lose the invocation state attached to it.
function startCronCheckIn(
  cron: string,
  monitorCronTriggers: CloudflareOptions['monitorCronTriggers'],
): ((status: 'ok' | 'error') => void) | undefined {
  const monitor = getCronTriggerMonitor(cron, monitorCronTriggers);
  if (!monitor) {
    return undefined;
  }

  const { monitorSlug, monitorConfig } = monitor;
  const checkInId = captureCheckIn({ monitorSlug, status: 'in_progress' }, monitorConfig);
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
