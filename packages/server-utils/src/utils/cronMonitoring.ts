import type { MonitorConfig } from '@sentry/core';
import { captureException, debug, isThenable, stringMatchesSomePattern, withMonitor } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import * as diagnosticsChannel from './diagnosticsChannel';

export type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

// Set by `Sentry.cron.instrumentNodeCron` and `Sentry.cron.instrumentNodeSchedule`, which already send check-ins.
const MONITORED = Symbol.for('sentry.cron.monitored');

/**
 * Calls `onJob` with the arguments of each call on a scheduler's job-creation channel, so it can wrap the job.
 * Errors are logged and the job is created unmonitored.
 */
export function subscribeToJobCreation(
  channelName: string,
  integrationName: string,
  onJob: (args: unknown[]) => void,
): void {
  diagnosticsChannel.tracingChannel<{ arguments: unknown[] }>(channelName).start.subscribe(message => {
    try {
      onJob((message as { arguments: unknown[] }).arguments);
    } catch (e) {
      DEBUG_BUILD && debug.error(`[${integrationName}] Failed to set up the cron monitor:`, e);
    }
  });
}

/** A call on a schedule-change channel: its arguments, the job it was called on, and what it returned. */
export interface ScheduleChange {
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
}

/**
 * Calls `onChange` after each call on a scheduler's schedule-change channel, so it can update the job's monitor config.
 * Errors are logged and the job keeps its config.
 */
export function subscribeToScheduleChange(
  channelName: string,
  integrationName: string,
  onChange: (change: ScheduleChange) => void,
): void {
  diagnosticsChannel.tracingChannel<ScheduleChange>(channelName).end.subscribe(message => {
    try {
      onChange(message as ScheduleChange);
    } catch (e) {
      DEBUG_BUILD && debug.error(`[${integrationName}] Failed to update the cron monitor:`, e);
    }
  });
}

/** Whether a job is named, not excluded, and not already monitored by `Sentry.cron.instrumentNodeCron` or `instrumentNodeSchedule`. */
export function shouldMonitorJob(
  name: unknown,
  job: unknown,
  excludeJobs: Array<string | RegExp> | undefined,
): name is string {
  return (
    typeof name === 'string' &&
    !!name &&
    typeof job === 'function' &&
    !(job as { [MONITORED]?: boolean })[MONITORED] &&
    !stringMatchesSomePattern(name, excludeJobs, true)
  );
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

/**
 * How a scheduler combines a restricted day-of-month and day-of-week:
 * - `and`: both must match (`node-cron`).
 * - `or`: either matches, unless one is `*` or a full range (`cron-parser`, `cron`).
 */
export type DayFieldSemantics = 'and' | 'or';

/**
 * The Sentry monitor config for a cron expression, or `undefined` if Sentry would read it differently.
 * Without a `timezone`, the server's time zone is used, like the schedulers do.
 */
export function cronExpressionToMonitorConfig(
  expression: string,
  timezone: unknown,
  daySemantics: DayFieldSemantics,
): MonitorConfig | undefined {
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
  if (!isSameDayMatching(dayOfMonth, dayOfWeek, daySemantics)) {
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

// Sentry requires both day fields to match when one starts with `*`, and either otherwise.
function isSameDayMatching(dayOfMonth: string, dayOfWeek: string, daySemantics: DayFieldSemantics): boolean {
  if (dayOfMonth === '*' || dayOfWeek === '*') {
    return true;
  }
  if (daySemantics === 'and') {
    return dayOfMonth.startsWith('*') || dayOfWeek.startsWith('*');
  }
  return !(
    dayOfMonth.startsWith('*') ||
    dayOfWeek.startsWith('*') ||
    dayOfMonth === '1-31' ||
    ['0-6', '0-7', '1-7'].includes(dayOfWeek)
  );
}

function replaceNames(field: string, names: string[], offset: number): string {
  return field.replace(/[a-z]+/gi, word => {
    const index = names.indexOf(word.slice(0, 3).toLowerCase());
    return index === -1 ? word : String(index + offset);
  });
}

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

const monitorConfigs = new WeakMap<AnyFn, MonitorConfig | undefined>();

/**
 * Wraps a scheduled job with check-ins. Errors are captured, because schedulers catch them, and rethrown.
 */
export function wrapScheduledJob(
  func: AnyFn,
  monitorSlug: string,
  monitorConfig: MonitorConfig | undefined,
  mechanismType: string,
): AnyFn {
  const captureAndRethrow = (error: unknown): never => {
    captureException(error, { mechanism: { handled: false, type: mechanismType } });
    throw error;
  };

  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    return withMonitor(
      monitorSlug,
      () => {
        try {
          const result: unknown = func.apply(this, args);
          return isThenable(result) ? result.then(undefined, captureAndRethrow) : result;
        } catch (e) {
          return captureAndRethrow(e);
        }
      },
      monitorConfigs.get(wrapped),
    );
  };
  monitorConfigs.set(wrapped, monitorConfig);
  return wrapped;
}

/** Sets the monitor config a job from `wrapScheduledJob` sends on its next runs. Other functions are ignored. */
export function updateMonitorConfig(job: unknown, monitorConfig: MonitorConfig | undefined): void {
  if (typeof job === 'function' && monitorConfigs.has(job as AnyFn)) {
    monitorConfigs.set(job as AnyFn, monitorConfig);
  }
}
