import type { MonitorConfig } from '@sentry/core';
import {
  addNonEnumerableProperty,
  captureException,
  debug,
  isThenable,
  startNewTrace,
  stringMatchesSomePattern,
  withMonitor,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import * as diagnosticsChannel from './diagnosticsChannel';

export type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

// Set by `Sentry.cron.instrumentCron`, `instrumentNodeCron`, `instrumentNodeSchedule` and `wrapScheduledJob`, which already
// send check-ins.
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
 * `onStart` gets the same object before the call. Errors are logged and the job keeps its config.
 */
export function subscribeToScheduleChange(
  channelName: string,
  integrationName: string,
  onChange: (change: ScheduleChange) => void,
  onStart?: (change: ScheduleChange) => void,
): void {
  const channel = diagnosticsChannel.tracingChannel<ScheduleChange>(channelName);
  const handle = (handler: (change: ScheduleChange) => void) => (message: unknown) => {
    try {
      handler(message as ScheduleChange);
    } catch (e) {
      DEBUG_BUILD && debug.error(`[${integrationName}] Failed to update the cron monitor:`, e);
    }
  };
  if (onStart) {
    channel.start.subscribe(handle(onStart));
  }
  channel.end.subscribe(handle(onChange));
}

/** Whether a job is named, not excluded, and not already monitored by `Sentry.cron.instrument*` or `wrapScheduledJob`. */
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

/**
 * The library that parses a scheduler's cron expressions: `node-cron`, `cron` (also behind `@nestjs/schedule`), or
 * `cron-parser` (behind `node-schedule`).
 */
export type CronDialect = 'node-cron' | 'cron' | 'cron-parser';

const COMMON_NICKNAMES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const NICKNAMES: Record<CronDialect, Record<string, string>> = {
  'node-cron': { ...COMMON_NICKNAMES, '@annually': '0 0 1 1 *', '@midnight': '0 0 * * *' },
  cron: { ...COMMON_NICKNAMES, '@minutely': '* * * * *', '@weekdays': '0 0 * * 1-5', '@weekends': '0 0 * * 0,6' },
  'cron-parser': COMMON_NICKNAMES,
};

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * The Sentry monitor config for a cron expression, or `undefined` if Sentry would read it differently.
 * Without a `timezone`, the server's time zone is used, like the schedulers do.
 */
export function cronExpressionToMonitorConfig(
  expression: string,
  timezone: unknown,
  dialect: CronDialect,
): MonitorConfig | undefined {
  const trimmed = expression.trim();
  const fields = (NICKNAMES[dialect][trimmed.toLowerCase()] || trimmed).split(/\s+/);

  // Sentry schedules have minute granularity, so only a fixed second can be dropped.
  const droppedSecond = fields.length === 6 && /^\d+$/.test(fields[0] as string) ? Number(fields.shift()) : 0;
  if (fields.length !== 5 || !fields.every(field => /^[\d*,/a-z#-]+$/i.test(field))) {
    return undefined;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];
  const monthNumbers = replaceNames(month, MONTHS, 1, dialect);
  const weekdayNames = replaceNames(dayOfWeek, WEEKDAYS, 0, dialect);
  const weekdayNumbers = dialect === 'node-cron' ? endRangesOnSundayAsSeven(weekdayNames) : weekdayNames;
  const crontab = [minute, hour, dayOfMonth, monthNumbers, weekdayNumbers];
  if (
    crontab.some(
      (field, index) =>
        hasUnsupportedCharacter(field, dialect === 'cron-parser' ? CRON_PARSER_DAY_TOKENS[index] : undefined) ||
        hasReversedRange(field) ||
        hasSteppedSingleValueRange(field),
    ) ||
    !isSameDayMatching(dayOfMonth, weekdayNumbers, dialect)
  ) {
    return undefined;
  }

  const sentryTimezone = toSentryTimezone(typeof timezone === 'string' && timezone ? timezone : undefined);
  if (!sentryTimezone) {
    return undefined;
  }

  return {
    schedule: { type: 'crontab', value: crontab.join(' ') },
    timezone: sentryTimezone,
    // The job runs up to 59 seconds after the minute Sentry expects, which nearly uses up its default 1-minute margin.
    ...(droppedSecond > 0 && { checkinMargin: 2 }),
  };
}

// `cron-parser` reads these like Sentry: `L` is the last day of the month, `5L` the last Friday, `5#2` the second Friday.
const CRON_PARSER_DAY_TOKENS = [undefined, undefined, /^L$/, undefined, /^[0-7](?:L|#[1-5])$/];

function hasUnsupportedCharacter(field: string, dayToken: RegExp | undefined): boolean {
  return field.split(',').some(part => /[a-z#]/i.test(part) && !dayToken?.test(part));
}

// Sentry needs both day fields to match when one starts with `*`, and either otherwise.
function isSameDayMatching(dayOfMonth: string, dayOfWeek: string, dialect: CronDialect): boolean {
  const monthDays = parseDayField(dayOfMonth, 1, 31);
  const weekdays = parseDayField(dayOfWeek, 0, 7);
  if (!monthDays || !weekdays) {
    return false;
  }
  const sentryNeedsBoth = dayOfMonth.startsWith('*') || dayOfWeek.startsWith('*');
  if (dialect === 'cron-parser') {
    return isSameDayMatchingInCronParser(dayOfMonth, dayOfWeek, monthDays, weekdays, sentryNeedsBoth);
  }
  // `cron` needs either day field to match, but ignores one that lists every day, like `1-31` or `sun-sat`.
  const allMonthDays = monthDays.days === 31;
  const allWeekdays = weekdays.days === 7;
  const schedulerNeedsBoth = dialect === 'node-cron' || allMonthDays || allWeekdays;
  return (allMonthDays && allWeekdays) || schedulerNeedsBoth === sentryNeedsBoth;
}

// `cron-parser` ignores a day-of-week with 8 values, and a day-of-month with at least as many values as the month has
// days (29 in February), duplicates included. Then only the other field has to match, and otherwise either.
function isSameDayMatchingInCronParser(
  dayOfMonth: string,
  dayOfWeek: string,
  monthDays: DayField,
  weekdays: DayField,
  sentryNeedsBoth: boolean,
): boolean {
  // `cron-parser` 4 ignores a restricted day of month when the day of week has a `#`.
  if (weekdays.cronParserAddsSunday || (dayOfWeek.includes('#') && (dayOfMonth !== '*' || dayOfWeek.includes(',')))) {
    return false;
  }
  if (dayOfWeek === '*') {
    return true;
  }
  if (dayOfMonth === '*') {
    return weekdays.cronParserValues !== 8 || weekdays.days === 7;
  }
  return !sentryNeedsBoth && monthDays.cronParserValues < 29 && weekdays.cronParserValues !== 8;
}

interface DayField {
  days: number;
  cronParserValues: number;
  cronParserAddsSunday: boolean;
}

function parseDayField(field: string, low: number, high: number): DayField | undefined {
  const days = new Set<number>();
  let cronParserValues = 0;
  let cronParserListsSunday = false;
  for (const part of field.split(',')) {
    // `L`, `5L` and `5#2` stand for one day each. Only the `cron-parser` dialect lets them through.
    if (/^(?:L|[0-7](?:L|#[1-5]))$/.test(part)) {
      cronParserValues++;
      continue;
    }
    const match = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!match) {
      return undefined;
    }
    const [, wildcard, from, to, step] = match;
    const lower = wildcard ? low : Number(from);
    const upper = wildcard || (step && !to) ? high : Number(to ?? from);
    const increment = Number(step ?? 1);
    if (!increment || lower < low || upper > high || lower > upper) {
      return undefined;
    }
    // `cron-parser` starts a weekday range that ends on 7 with a Sunday, whatever the step.
    if (high === 7 && upper === 7 && lower !== 0 && (to || step)) {
      cronParserValues++;
      cronParserListsSunday = true;
    }
    for (let day = lower; day <= upper; day += increment) {
      days.add(high === 7 && day === 7 ? 0 : day);
      cronParserValues++;
    }
  }
  return {
    days: days.size,
    cronParserValues,
    cronParserAddsSunday: cronParserListsSunday && !days.has(0),
  };
}

function replaceNames(field: string, names: string[], offset: number, dialect: CronDialect): string {
  return field.replace(/[a-z]+/gi, word => {
    const lowerCase = word.toLowerCase();
    const index = names.findIndex(
      name => lowerCase === name.slice(0, 3) || (dialect === 'node-cron' && lowerCase === name),
    );
    return index === -1 ? word : String(index + offset);
  });
}

// `sat-sun` is `6-0`, which node-cron 4.6+ runs on Saturday and Sunday. Sentry only accepts it as `6-7`. The other
// schedulers reject it.
function endRangesOnSundayAsSeven(field: string): string {
  return field
    .split(',')
    .map(part => part.replace(/^(\d+)-0(?!\d)/, (range, start: string) => (Number(start) ? `${start}-7` : range)))
    .join(',');
}

// node-cron 4.6+ wraps these around (`22-2` hours), earlier versions swap them, the other schedulers reject them,
// and so does Sentry.
function hasReversedRange(field: string): boolean {
  return field.split(',').some(part => {
    const range = /^(\d+)-(\d+)/.exec(part);
    return !!range && Number(range[1]) > Number(range[2]);
  });
}

// The schedulers run `13-13/3` only on the 13th, but Sentry reads it as `13/3`.
function hasSteppedSingleValueRange(field: string): boolean {
  return field.split(',').some(part => {
    const range = /^(\d+)-(\d+)\//.exec(part);
    return !!range && Number(range[1]) === Number(range[2]);
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
 * Jobs without a monitor config send no check-ins.
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
    const run = (): unknown => {
      try {
        const result: unknown = func.apply(this, args);
        return isThenable(result) ? result.then(undefined, captureAndRethrow) : result;
      } catch (e) {
        return captureAndRethrow(e);
      }
    };
    const currentConfig = monitorConfigs.get(wrapped);
    return startNewTrace(() => (currentConfig ? withMonitor(monitorSlug, run, currentConfig) : run()));
  };
  monitorConfigs.set(wrapped, monitorConfig);
  addNonEnumerableProperty(wrapped, MONITORED, true);
  return wrapped;
}

/** Sets the monitor config a job from `wrapScheduledJob` sends on its next runs. Other functions are ignored. */
export function updateMonitorConfig(job: unknown, monitorConfig: MonitorConfig | undefined): void {
  if (typeof job === 'function' && monitorConfigs.has(job as AnyFn)) {
    monitorConfigs.set(job as AnyFn, monitorConfig);
  }
}
