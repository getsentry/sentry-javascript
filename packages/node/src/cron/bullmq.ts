import { captureCheckIn, debug, type MonitorConfig, timestampInSeconds } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { replaceCronNames } from './common';

interface BullMQRepeatOptions {
  pattern?: unknown;
  every?: unknown;
  tz?: unknown;
  utc?: unknown;
  limit?: unknown;
  endDate?: unknown;
}

interface BullMQJob {
  repeatJobKey?: unknown;
  opts?: { repeat?: BullMQRepeatOptions };
}

export interface InstrumentBullMQWorkerOptions {
  /** Job scheduler ids to not monitor. Strings match the id exactly. */
  excludeJobSchedulers?: Array<string | RegExp>;
}

const CRON_PRESETS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const FULL_DAY_OF_WEEK_RANGES = new Set(['0-6', '0-7', '1-7']);

// Legacy repeatable jobs (`queue.add` with `repeat`) are keyed by a hash or `name:id:endDate:tz:pattern`.
const LEGACY_REPEAT_KEY = /^[\da-f]{32,}$|^(?:[^:]*:){4}/;

const instrumentedWorkers = new WeakSet<object>();

/**
 * Sends check-ins to Sentry for every job a BullMQ worker runs from a job scheduler.
 * The job scheduler id is the monitor slug, and its `pattern` or `every` is sent as the monitor schedule.
 *
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import { Worker } from 'bullmq';
 *
 * const worker = new Worker('reports', processor, { connection });
 * Sentry.cron.instrumentBullMQWorker(worker, { excludeJobSchedulers: ['cache-warmup'] });
 * ```
 */
export function instrumentBullMQWorker<T extends { on: (...args: never[]) => unknown }>(
  worker: T,
  options: InstrumentBullMQWorkerOptions = {},
): T {
  if (instrumentedWorkers.has(worker)) {
    return worker;
  }
  instrumentedWorkers.add(worker);

  // Sentry keeps the trace of the `in_progress` check-in. BullMQ emits `active` before the job's trace starts,
  // often inside the previous job's, so send it from the processor instead.
  const target = worker as unknown as { processFn?: (job: BullMQJob, ...args: unknown[]) => unknown };
  const processFn = target.processFn;
  if (typeof processFn !== 'function') {
    return worker;
  }

  const running = new WeakMap<object, { monitorSlug: string; checkInId: string; start: number }>();

  target.processFn = function (this: unknown, job: BullMQJob, ...args: unknown[]): unknown {
    try {
      const monitorSlug = getJobSchedulerId(job, options.excludeJobSchedulers);
      if (job && monitorSlug) {
        const checkInId = captureCheckIn({ monitorSlug, status: 'in_progress' }, getMonitorConfig(job.opts?.repeat));
        running.set(job, { monitorSlug, checkInId, start: timestampInSeconds() });
      }
    } catch (e) {
      DEBUG_BUILD && debug.error('[BullMQ] Failed to send check-in:', e);
    }
    return processFn.call(this, job, ...args);
  };

  const finish =
    (status: 'ok' | 'error') =>
    (job?: BullMQJob): void => {
      try {
        const run = job && running.get(job);
        if (job && run) {
          running.delete(job);
          const { monitorSlug, checkInId, start } = run;
          captureCheckIn({ monitorSlug, status, checkInId, duration: timestampInSeconds() - start });
          return;
        }
        // BullMQ fails some jobs, such as ones that stalled too often, without running the processor.
        const monitorSlug = status === 'error' && getJobSchedulerId(job, options.excludeJobSchedulers);
        if (job && monitorSlug) {
          captureCheckIn({ monitorSlug, status }, getMonitorConfig(job.opts?.repeat));
        }
      } catch (e) {
        DEBUG_BUILD && debug.error('[BullMQ] Failed to send check-in:', e);
      }
    };
  const on = worker.on as unknown as (event: string, listener: (job?: BullMQJob) => void) => unknown;
  on.call(worker, 'completed', finish('ok'));
  on.call(worker, 'failed', finish('error'));

  return worker;
}

function getJobSchedulerId(job: BullMQJob | undefined, exclude: Array<string | RegExp> = []): string | undefined {
  const id = job?.repeatJobKey;
  if (typeof id !== 'string' || !id || LEGACY_REPEAT_KEY.test(id)) {
    return undefined;
  }
  return exclude.some(pattern => (typeof pattern === 'string' ? pattern === id : pattern.test(id))) ? undefined : id;
}

function getMonitorConfig(repeat: BullMQRepeatOptions | undefined): MonitorConfig | undefined {
  // A scheduler that stops after `limit` runs or `endDate` would show up as missed.
  if (!repeat || repeat.limit != null || repeat.endDate != null) {
    return undefined;
  }

  if (typeof repeat.every === 'number') {
    const minutes = repeat.every / 60_000;
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return undefined;
    }
    if (minutes % 1440 === 0) {
      return { schedule: { type: 'interval', value: minutes / 1440, unit: 'day' } };
    }
    if (minutes % 60 === 0) {
      return { schedule: { type: 'interval', value: minutes / 60, unit: 'hour' } };
    }
    return { schedule: { type: 'interval', value: minutes, unit: 'minute' } };
  }

  const crontab = typeof repeat.pattern === 'string' ? toCrontab(repeat.pattern) : undefined;
  // cron-parser 4 (BullMQ 5) prefers `utc` over `tz`, and uses the server's time zone without either.
  const timezone = toSentryTimeZone(
    repeat.utc === true ? 'UTC' : typeof repeat.tz === 'string' && repeat.tz ? repeat.tz : getLocalTimeZone(),
  );
  return crontab && timezone ? { schedule: { type: 'crontab', value: crontab }, timezone } : undefined;
}

/**
 * Converts a cron-parser pattern to a crontab that Sentry reads the same way, if there is one.
 */
function toCrontab(pattern: string): string | undefined {
  const preset = CRON_PRESETS[pattern.trim().toLowerCase()];
  if (preset) {
    return preset;
  }

  const fields = replaceCronNames(pattern).trim().split(/\s+/);
  if (fields.length === 6 && /^0+$/.test(fields[0] as string)) {
    fields.shift();
  }
  if (fields.length !== 5 || fields.some(field => !/^[\d*,/\-L#]+$/.test(field))) {
    return undefined;
  }

  // With both day fields set, cron-parser runs on either, but Sentry needs both when one starts with `*`.
  // cron-parser 4 also treats `1-31` as `*`.
  const [, , dayOfMonth = '', , dayOfWeek = ''] = fields;
  if (
    dayOfMonth !== '*' &&
    dayOfWeek !== '*' &&
    (dayOfMonth.startsWith('*') ||
      dayOfWeek.startsWith('*') ||
      dayOfMonth === '1-31' ||
      FULL_DAY_OF_WEEK_RANGES.has(dayOfWeek))
  ) {
    return undefined;
  }

  return fields.join(' ');
}

function toSentryTimeZone(timezone: string | undefined): string | undefined {
  if (!timezone || timezone === 'Etc/Unknown' || /^(?:utc|gmt)?[+-]/i.test(timezone)) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function getLocalTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
