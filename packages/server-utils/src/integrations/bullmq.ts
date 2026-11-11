import { createHash } from 'node:crypto';
import type { InProgressCheckIn, IntegrationFn, MonitorConfig } from '@sentry/core';
import {
  captureCheckIn,
  debug,
  defineIntegration,
  getClient,
  stringMatchesSomePattern,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { bullmqModuleNames } from '../orchestrion/config/bullmq';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { cronExpressionToMonitorConfig } from '../utils/cronMonitoring';
import * as diagnosticsChannel from '../utils/diagnosticsChannel';

const INTEGRATION_NAME = 'BullMQJobScheduler' as const;

export interface BullMQJobSchedulerIntegrationOptions {
  /** Job scheduler ids not to monitor. Strings must match the id exactly. */
  excludeJobSchedulers?: Array<string | RegExp>;
}

const _bullmqJobSchedulerIntegration = ((options: BullMQJobSchedulerIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, bullmqModuleNames, subscribe, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for the jobs a BullMQ 5.16 to 6.x worker runs from job schedulers, with `<queue>-<job scheduler id>`
 * as the monitor slug. Schedulers that end or whose schedule Crons can't express are not monitored.
 */
export const bullmqJobSchedulerIntegration = defineIntegration(_bullmqJobSchedulerIntegration);

type BullMQMajor = 5 | 6;

function subscribe(options: BullMQJobSchedulerIntegrationOptions): void {
  const channels = [
    [CHANNELS.BULLMQ_WORKER_CONSTRUCTOR, 5],
    [CHANNELS.BULLMQ_6_WORKER_CONSTRUCTOR, 6],
  ] as const;
  for (const [channel, major] of channels) {
    diagnosticsChannel.tracingChannel<{ self?: unknown }>(channel).end.subscribe(message => {
      try {
        instrumentWorker(message.self, options, major);
      } catch (e) {
        DEBUG_BUILD && debug.error(`[${INTEGRATION_NAME}] Failed to set up the cron monitor:`, e);
      }
    });
  }
}

interface BullMQRepeatOptions {
  pattern?: unknown;
  every?: unknown;
  tz?: unknown;
  utc?: unknown;
  nthDayOfWeek?: unknown;
  limit?: unknown;
  endDate?: unknown;
  key?: unknown;
  jobId?: unknown;
}

interface BullMQJob {
  id?: unknown;
  name?: unknown;
  queueQualifiedName?: unknown;
  timestamp?: unknown;
  repeatJobKey?: unknown;
  attemptsStarted?: unknown;
  attemptsMade?: unknown;
  finishedOn?: unknown;
  opts?: { repeat?: BullMQRepeatOptions };
}

interface BullMQWorker {
  name?: unknown;
  processFn?: (job: BullMQJob, ...args: unknown[]) => unknown;
  opts?: { settings?: { repeatStrategy?: unknown; repeatKeyHashAlgorithm?: unknown } };
  on?: (event: string, listener: (job?: BullMQJob) => void) => unknown;
}

interface Monitor {
  monitorSlug: string;
  checkInId: string;
  config: MonitorConfig;
}

interface WorkerSettings {
  major: BullMQMajor;
  hasCustomRepeatStrategy: boolean;
  repeatKeyHashAlgorithm: string;
  exclude: Array<string | RegExp> | undefined;
}

const instrumentedWorkers = new WeakSet<object>();
const loggedSchedulers = new Set<string>();

// `captureCheckIn` keeps a given `checkInId` for `in_progress` check-ins too.
type InProgressCheckInWithId = InProgressCheckIn & { checkInId: string };

/** Sends check-ins for the jobs a new BullMQ worker runs from job schedulers. */
export function instrumentWorker(
  worker: unknown,
  options: BullMQJobSchedulerIntegrationOptions,
  major: BullMQMajor,
): void {
  const target = worker as BullMQWorker | undefined;
  const queueName = target?.name;
  const processFn = target?.processFn;
  if (
    !target ||
    instrumentedWorkers.has(target) ||
    typeof processFn !== 'function' ||
    typeof queueName !== 'string' ||
    typeof target.on !== 'function'
  ) {
    return;
  }
  instrumentedWorkers.add(target);
  const settings = target.opts?.settings;
  const workerSettings: WorkerSettings = {
    major,
    hasCustomRepeatStrategy: !!settings?.repeatStrategy,
    repeatKeyHashAlgorithm:
      typeof settings?.repeatKeyHashAlgorithm === 'string' ? settings.repeatKeyHashAlgorithm : 'md5',
    exclude: options.excludeJobSchedulers,
  };
  const monitorFor = (job: BullMQJob | undefined): Monitor | undefined => getMonitor(job, queueName, workerSettings);

  const startTimes = new WeakMap<object, number>();

  // Sentry keeps the trace of the `in_progress` check-in. BullMQ emits `active` before the job's trace starts,
  // often inside the previous job's, so send it from the processor instead.
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
      DEBUG_BUILD && debug.error(`[${INTEGRATION_NAME}] Failed to send check-in:`, e);
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
        DEBUG_BUILD && debug.error(`[${INTEGRATION_NAME}] Failed to send check-in:`, e);
      }
    };
  target.on('completed', finish('ok'));
  target.on('failed', finish('error'));
}

function getMonitor(job: BullMQJob | undefined, queueName: string, settings: WorkerSettings): Monitor | undefined {
  const schedulerId = job && getJobSchedulerId(job, settings);
  if (!job || !schedulerId) {
    return undefined;
  }
  // Scheduler ids are only unique within a queue.
  const monitorSlug = `${queueName}-${schedulerId}`;
  const config = getMonitorConfig(job.opts?.repeat, settings);
  if (typeof config === 'string') {
    if (DEBUG_BUILD && !loggedSchedulers.has(monitorSlug)) {
      loggedSchedulers.add(monitorSlug);
      debug.log(`[${INTEGRATION_NAME}] Not monitoring ${monitorSlug}: ${config}.`);
    }
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

function getJobSchedulerId(job: BullMQJob, settings: WorkerSettings): string | undefined {
  const id = job.repeatJobKey;
  if (typeof id !== 'string' || !id || isLegacyRepeatableJob(job, id, settings.repeatKeyHashAlgorithm)) {
    return undefined;
  }
  return stringMatchesSomePattern(id, settings.exclude, true) ? undefined : id;
}

// BullMQ 5 keys repeatable jobs from `queue.add` by `repeat.key`, or by their name and repeat options or a hash of them.
// Job schedulers don't take a `key`.
function isLegacyRepeatableJob(job: BullMQJob, id: string, hashAlgorithm: string): boolean {
  const repeat = job.opts?.repeat;
  if (!repeat) {
    return false;
  }
  if (repeat.key != null) {
    return true;
  }
  const endDate = repeat.endDate ? new Date(repeat.endDate as string).getTime() : '';
  const suffix = repeat.pattern || String(repeat.every);
  const key = `${job.name}:${repeat.jobId || ''}:${endDate}:${repeat.tz || ''}:${suffix}`;
  return id === key || id === createHash(hashAlgorithm).update(key).digest('hex');
}

/** The monitor config for a job scheduler's repeat options, or why it isn't monitored. */
function getMonitorConfig(repeat: BullMQRepeatOptions | undefined, settings: WorkerSettings): MonitorConfig | string {
  // A scheduler that stops would show up as missed.
  if (repeat?.limit != null) {
    return 'it sets a limit';
  }
  if (repeat?.endDate != null) {
    return 'it sets an endDate';
  }

  if (typeof repeat?.every === 'number') {
    const minutes = repeat.every / 60_000;
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return "Crons can't express its schedule";
    }
    if (minutes % 1440 === 0) {
      return { schedule: { type: 'interval', value: minutes / 1440, unit: 'day' } };
    }
    if (minutes % 60 === 0) {
      return { schedule: { type: 'interval', value: minutes / 60, unit: 'hour' } };
    }
    return { schedule: { type: 'interval', value: minutes, unit: 'minute' } };
  }

  if (typeof repeat?.pattern !== 'string') {
    return "Crons can't express its schedule";
  }
  if (settings.hasCustomRepeatStrategy) {
    return 'the worker has a custom repeatStrategy';
  }
  // BullMQ 6's cron-parser ignores `utc` and `nthDayOfWeek`.
  const pattern = settings.major === 6 ? repeat.pattern : withNthDayOfWeek(repeat.pattern, repeat.nthDayOfWeek);
  if (!pattern) {
    return "Crons can't express its nthDayOfWeek";
  }
  const timezone = settings.major === 5 && repeat.utc ? 'UTC' : repeat.tz;
  return cronExpressionToMonitorConfig(pattern, timezone, 'cron-parser') || "Crons can't express its schedule";
}

// cron-parser 4 reads `{ pattern: '0 9 * * 1', nthDayOfWeek: 2 }` like `0 9 * * 1#2`, and applies `nthDayOfWeek` to
// any other day of week too.
function withNthDayOfWeek(pattern: string, nthDayOfWeek: unknown): string | undefined {
  if (!nthDayOfWeek) {
    return pattern;
  }
  const fields = pattern.trim().split(/\s+/);
  const dayOfWeek = fields[fields.length - 1] as string;
  if (
    (fields.length !== 5 && fields.length !== 6) ||
    !/^(?:[0-7]|[a-z]+)$/i.test(dayOfWeek) ||
    typeof nthDayOfWeek !== 'number' ||
    !Number.isInteger(nthDayOfWeek) ||
    nthDayOfWeek < 1 ||
    nthDayOfWeek > 5
  ) {
    return undefined;
  }
  fields[fields.length - 1] = `${dayOfWeek}#${nthDayOfWeek}`;
  return fields.join(' ');
}
