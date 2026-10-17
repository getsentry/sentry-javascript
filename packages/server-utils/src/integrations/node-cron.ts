import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import {
  captureException,
  debug,
  defineIntegration,
  isThenable,
  stringMatchesSomePattern,
  withMonitor,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { nodeCronModuleNames } from '../orchestrion/config/node-cron';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

const INTEGRATION_NAME = 'NodeCron' as const;

// Set by `Sentry.cron.instrumentNodeCron`, which already sends check-ins.
const MONITORED = Symbol.for('sentry.cron.monitored');

export interface NodeCronIntegrationOptions {
  /** Task names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

const NICKNAMES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

const NOOP = (): void => {};

let options: NodeCronIntegrationOptions = {};

const _nodeCronIntegration = ((integrationOptions: NodeCronIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      options = integrationOptions;
      invokeOrchestrionInstrumentation(client, nodeCronModuleNames, subscribe, [], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for every named `node-cron` task, with its schedule as the monitor config.
 * The monitor slug is the task's `name` option; tasks without a name are not monitored.
 */
export const nodeCronIntegration = defineIntegration(_nodeCronIntegration);

function subscribe(): void {
  diagnosticsChannel.tracingChannel<{ arguments: unknown[] }>(CHANNELS.NODE_CRON_CREATE_TASK).subscribe({
    start(data) {
      try {
        const [expression, func, taskOptions] = data.arguments;
        const { name, timezone } = (taskOptions || {}) as { name?: unknown; timezone?: unknown };
        if (
          typeof func !== 'function' ||
          (func as { [MONITORED]?: boolean })[MONITORED] ||
          typeof name !== 'string' ||
          !name ||
          stringMatchesSomePattern(name, options.excludeJobs, true)
        ) {
          return;
        }
        data.arguments[1] = wrapTask(func as AnyFn, name, toMonitorConfig(String(expression), timezone));
      } catch (e) {
        DEBUG_BUILD && debug.error('[NodeCron] Failed to set up the cron monitor:', e);
      }
    },
    end: NOOP,
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}

function wrapTask(func: AnyFn, name: string, monitorConfig: MonitorConfig | undefined): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    return withMonitor(
      name,
      () => {
        // node-cron catches task errors, so capture them here.
        try {
          const result: unknown = func.apply(this, args);
          return isThenable(result) ? result.then(undefined, captureAndRethrow) : result;
        } catch (e) {
          return captureAndRethrow(e);
        }
      },
      monitorConfig,
    );
  };
}

function captureAndRethrow(error: unknown): never {
  captureException(error, { mechanism: { handled: false, type: 'auto.function.node-cron' } });
  throw error;
}

/**
 * The monitor config for a `node-cron` expression, or `undefined` if Sentry would read it differently.
 */
export function toMonitorConfig(expression: string, timezone: unknown): MonitorConfig | undefined {
  const trimmed = expression.trim();
  const fields = (NICKNAMES[trimmed.toLowerCase()] || trimmed).split(/\s+/);

  // Sentry schedules have minute granularity, so only a fixed second can be dropped.
  if (fields.length === 6 && /^\d+$/.test(fields[0] as string)) {
    fields.shift();
  }
  if (fields.length !== 5 || !fields.every(field => /^[\d*,/a-z-]+$/i.test(field))) {
    return undefined;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];
  // node-cron requires both day fields to match, Sentry does that only when one starts with `*`.
  if (!dayOfMonth.startsWith('*') && !dayOfWeek.startsWith('*')) {
    return undefined;
  }

  const crontab = [minute, hour, dayOfMonth, replaceNames(month, MONTHS, 1), replaceNames(dayOfWeek, WEEKDAYS, 0)];
  if (crontab.some(field => /[a-z]/i.test(field))) {
    return undefined;
  }

  const sentryTimezone = toSentryTimezone(typeof timezone === 'string' && timezone ? timezone : undefined);
  if (!sentryTimezone) {
    return undefined;
  }

  return { schedule: { type: 'crontab', value: crontab.join(' ') }, timezone: sentryTimezone };
}

function replaceNames(field: string, names: string[], offset: number): string {
  return field.replace(/[a-z]+/gi, word => {
    const index = names.indexOf(word.slice(0, 3).toLowerCase());
    return index === -1 ? word : String(index + offset);
  });
}

// node-cron runs in the server's time zone without a `timezone` option.
function toSentryTimezone(timezone: string | undefined): string | undefined {
  if (timezone && /^(?:utc|gmt)?[+-]/i.test(timezone)) {
    return undefined;
  }
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone;
    return resolved && resolved !== 'Etc/Unknown' ? resolved : undefined;
  } catch {
    return undefined;
  }
}
