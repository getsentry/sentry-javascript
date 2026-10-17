import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import {
  captureCheckIn,
  captureException,
  debug,
  defineIntegration,
  isPlainObject,
  stringMatchesSomePattern,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { graphileWorkerModuleNames } from '../orchestrion/config/graphile-worker';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

const INTEGRATION_NAME = 'GraphileWorker' as const;

export interface GraphileWorkerOptions {
  /**
   * Send check-ins for the jobs the crontab schedules. The monitor slug is the identifier of the
   * crontab item (its `id` option, or else the task identifier).
   *
   * Defaults to `false`.
   */
  monitorCronJobs?: boolean;

  /**
   * Crontab item identifiers not to monitor. Strings must match the identifier exactly.
   */
  excludeCronJobs?: Array<string | RegExp>;
}

interface CronItem {
  identifier: string;
  task: string;
  payload?: Record<string, unknown> | null;
  match: (digest: Record<'min' | 'hour' | 'date' | 'month' | 'dow', number>) => boolean;
}

interface Job {
  task_identifier?: string;
  payload?: unknown;
}

interface Events {
  on(event: string, listener: (event: { job?: Job; error?: unknown }) => void): unknown;
}

const _graphileWorkerIntegration = ((options: GraphileWorkerOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (options.monitorCronJobs) {
        invokeOrchestrionInstrumentation(client, graphileWorkerModuleNames, instrumentGraphileWorker, [options], {
          requiresTracingChannelBinding: false,
        });
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for the jobs the `graphile-worker` crontab schedules.
 * Requires the Sentry runtime hook or bundler plugin.
 */
export const graphileWorkerIntegration = defineIntegration(_graphileWorkerIntegration);

function instrumentGraphileWorker(options: GraphileWorkerOptions): void {
  const monitoredEvents = new WeakSet<object>();

  diagnosticsChannel.tracingChannel<{ arguments: unknown[] }>(CHANNELS.GRAPHILE_WORKER_RUN_CRON).subscribe({
    start(data) {
      const [sharedOptions, items, requirements] = data.arguments as [
        { events?: Events }?,
        unknown?,
        { events?: Events }?,
      ];
      const events = requirements?.events || sharedOptions?.events;
      if (Array.isArray(items) && typeof events?.on === 'function' && !monitoredEvents.has(events)) {
        monitoredEvents.add(events);
        monitorGraphileCronJobs(events, items as CronItem[], options);
      }
    },
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error() {},
  });
}

/** Sends check-ins for the jobs a runner's crontab schedules. Exported for tests. */
export function monitorGraphileCronJobs(events: Events, items: CronItem[], options: GraphileWorkerOptions): void {
  const runs = new WeakMap<Job, { slug: string; checkInId: string; start: number }>();

  events.on('job:start', ({ job }) => {
    try {
      const item = job && findCronItem(items, job);
      if (!job || !item || stringMatchesSomePattern(item.identifier, options.excludeCronJobs, true)) {
        return;
      }
      const slug = item.identifier;
      const checkInId = captureCheckIn({ monitorSlug: slug, status: 'in_progress' });
      runs.set(job, { slug, checkInId, start: timestampInSeconds() });
    } catch (e) {
      DEBUG_BUILD && debug.error('[GraphileWorker] Failed to send the check-in:', e);
    }
  });

  events.on('job:complete', ({ job, error }) => {
    const run = job && runs.get(job);
    if (!job || !run) {
      return;
    }
    runs.delete(job);
    try {
      if (error) {
        captureException(error, { mechanism: { handled: false, type: 'auto.function.graphile_worker.cron' } });
      }
      captureCheckIn({
        monitorSlug: run.slug,
        status: error ? 'error' : 'ok',
        checkInId: run.checkInId,
        duration: timestampInSeconds() - run.start,
      });
    } catch (e) {
      DEBUG_BUILD && debug.error('[GraphileWorker] Failed to send the check-in:', e);
    }
  });
}

// Cron jobs carry the task, the item's payload and `_cron.ts`, but not the item identifier.
function findCronItem(items: CronItem[], job: Job): CronItem | undefined {
  if (!isPlainObject(job.payload)) {
    return undefined;
  }
  const { _cron: cron, ...payload } = job.payload;
  if (!isPlainObject(cron) || typeof cron.ts !== 'string') {
    return undefined;
  }
  const ts = new Date(cron.ts);
  const digest = {
    min: ts.getUTCMinutes(),
    hour: ts.getUTCHours(),
    date: ts.getUTCDate(),
    month: ts.getUTCMonth() + 1,
    dow: ts.getUTCDay(),
  };

  let candidates = items.filter(item => item.task === job.task_identifier && item.match(digest));
  if (candidates.length > 1) {
    const json = JSON.stringify(payload);
    candidates = candidates.filter(item => JSON.stringify(item.payload || {}) === json);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
