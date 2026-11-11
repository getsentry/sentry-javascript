import { createHash } from 'node:crypto';
import {
  captureCheckIn,
  debug,
  getClient,
  type InProgressCheckIn,
  type MonitorConfig,
  stringMatchesSomePattern,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { getCronMonitorConfig } from './common';

interface BullMQRepeatOptions {
  pattern?: unknown;
  every?: unknown;
  tz?: unknown;
  utc?: unknown;
  limit?: unknown;
  endDate?: unknown;
}

interface BullMQJob {
  id?: unknown;
  queueQualifiedName?: unknown;
  timestamp?: unknown;
  repeatJobKey?: unknown;
  attemptsStarted?: unknown;
  attemptsMade?: unknown;
  finishedOn?: unknown;
  opts?: { repeat?: BullMQRepeatOptions };
}

export interface InstrumentBullMQWorkerOptions {
  /** Job scheduler ids to not monitor. Strings match the id exactly. */
  excludeJobSchedulers?: Array<string | RegExp>;
}

// Legacy repeatable jobs (`queue.add` with `repeat`) are keyed by a hash or `name:id:endDate:tz:pattern`.
const LEGACY_REPEAT_KEY = /^[\da-f]{32,}$|^(?:[^:]*:){4}/;

const instrumentedWorkers = new WeakSet<object>();

interface Monitor {
  monitorSlug: string;
  checkInId: string;
  config: MonitorConfig;
}

// `captureCheckIn` keeps a given `checkInId` for `in_progress` check-ins too.
type InProgressCheckInWithId = InProgressCheckIn & { checkInId: string };

/**
 * Sends check-ins to Sentry for every job a BullMQ worker runs from a job scheduler.
 * The monitor slug is `<queue>-<job scheduler id>`, and the scheduler's `pattern` or `every` is the monitor schedule.
 * Schedulers whose schedule Sentry can't represent, or that set `limit` or `endDate`, are not monitored.
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
  const target = worker as unknown as {
    name?: unknown;
    processFn?: (job: BullMQJob, ...args: unknown[]) => unknown;
    opts?: { settings?: { repeatStrategy?: unknown } };
  };
  const { name: queueName, processFn } = target;
  if (typeof processFn !== 'function' || typeof queueName !== 'string') {
    return worker;
  }
  // A custom repeat strategy decides what `pattern` means.
  const hasCustomRepeatStrategy = !!target.opts?.settings?.repeatStrategy;
  const monitorFor = (job: BullMQJob | undefined): Monitor | undefined =>
    getMonitor(job, queueName, options.excludeJobSchedulers, hasCustomRepeatStrategy);

  const startTimes = new WeakMap<object, number>();

  target.processFn = function (this: unknown, job: BullMQJob, ...args: unknown[]): unknown {
    try {
      const monitor = monitorFor(job);
      if (job && monitor) {
        const { monitorSlug, checkInId, config } = monitor;
        // Retries and reruns of stalled jobs update the first attempt's check-in, which may be on another worker.
        captureCheckIn({ monitorSlug, status: 'in_progress', checkInId } as InProgressCheckInWithId, config);
        if (isFirstAttempt(job)) {
          startTimes.set(job, timestampInSeconds());
        }
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
        // BullMQ emits `failed` for every attempt, and only sets `finishedOn` once it stops retrying.
        if (!job || (status === 'error' && !job.finishedOn)) {
          return;
        }
        const monitor = monitorFor(job);
        if (!monitor) {
          return;
        }
        const { monitorSlug, checkInId, config } = monitor;
        const start = startTimes.get(job);
        // Without a start time, Sentry measures the duration from the first `in_progress` check-in.
        const duration = start === undefined ? undefined : timestampInSeconds() - start;
        // BullMQ fails some jobs, such as ones that started too often, without running the processor, so send the
        // config in case the check-in doesn't exist yet.
        captureCheckIn({ monitorSlug, status, checkInId, ...(duration !== undefined && { duration }) }, config);
      } catch (e) {
        DEBUG_BUILD && debug.error('[BullMQ] Failed to send check-in:', e);
      }
    };
  const on = worker.on as unknown as (event: string, listener: (job?: BullMQJob) => void) => unknown;
  on.call(worker, 'completed', finish('ok'));
  on.call(worker, 'failed', finish('error'));

  return worker;
}

function getMonitor(
  job: BullMQJob | undefined,
  queueName: string,
  exclude: Array<string | RegExp> | undefined,
  hasCustomRepeatStrategy: boolean,
): Monitor | undefined {
  const schedulerId = getJobSchedulerId(job, exclude);
  if (!job || !schedulerId) {
    return undefined;
  }
  // Scheduler ids are only unique within a queue.
  const monitorSlug = `${queueName}-${schedulerId}`;
  const repeat = job.opts?.repeat;
  const config = hasCustomRepeatStrategy && repeat?.pattern != null ? undefined : getMonitorConfig(repeat);
  if (!config) {
    DEBUG_BUILD && debug.log(`[BullMQ] Not monitoring ${monitorSlug}: Sentry can't represent its schedule.`);
    return undefined;
  }
  return { monitorSlug, checkInId: getCheckInId(job), config };
}

// Check-in ids are global in Sentry, so mix in the DSN and environment, not just the job.
function getCheckInId(job: BullMQJob): string {
  const options = getClient()?.getOptions();
  return createHash('sha256')
    .update(JSON.stringify([options?.dsn, options?.environment, job.queueQualifiedName, job.id, job.timestamp]))
    .digest('hex')
    .slice(0, 32);
}

function isFirstAttempt(job: BullMQJob): boolean {
  return !job.attemptsMade && (typeof job.attemptsStarted !== 'number' || job.attemptsStarted <= 1);
}

function getJobSchedulerId(
  job: BullMQJob | undefined,
  exclude: Array<string | RegExp> | undefined,
): string | undefined {
  const id = job?.repeatJobKey;
  if (typeof id !== 'string' || !id || LEGACY_REPEAT_KEY.test(id)) {
    return undefined;
  }
  return stringMatchesSomePattern(id, exclude, true) ? undefined : id;
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

  if (typeof repeat.pattern !== 'string') {
    return undefined;
  }
  // BullMQ 5's cron-parser prefers `utc` over `tz`.
  return getCronMonitorConfig(repeat.pattern, repeat.utc === true ? 'UTC' : repeat.tz, 'cron-parser');
}
