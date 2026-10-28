import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { cronModuleNames } from '../orchestrion/config/cron';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn, ScheduleChange } from '../utils/cronMonitoring';
import {
  cronExpressionToMonitorConfig,
  shouldMonitorJob,
  subscribeToJobCreation,
  subscribeToScheduleChange,
  updateMonitorConfig,
  wrapScheduledJob,
} from '../utils/cronMonitoring';

const INTEGRATION_NAME = 'CronJob' as const;

export interface CronJobIntegrationOptions {
  /** Job names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

const _cronJobIntegration = ((options: CronJobIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, cronModuleNames, subscribe, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for every `CronJob` of the `cron` package (4.3+) that has a `name`.
 * The monitor slug is the job name; jobs without a name, and one-off jobs, are not monitored.
 */
export const cronJobIntegration = defineIntegration(_cronJobIntegration);

function subscribe(options: CronJobIntegrationOptions): void {
  subscribeToJobCreation(CHANNELS.CRON_JOB_CONSTRUCTOR, INTEGRATION_NAME, args => wrapJob(args, options));
  subscribeToScheduleChange(CHANNELS.CRON_JOB_SET_TIME, INTEGRATION_NAME, onSetTime);
}

/** Sends the new time's config after `job.setTime(cronTime)`. */
export function onSetTime({ arguments: [cronTime], self }: ScheduleChange): void {
  const job = self as { cronTime?: unknown; _callbacks?: unknown[] } | undefined;
  // `setTime` throws and keeps the old time when it isn't given a `CronTime`.
  if (!job || job.cronTime !== cronTime) {
    return;
  }
  const { source, timeZone, utcOffset } = cronTime as { source?: unknown; timeZone?: unknown; utcOffset?: unknown };
  const monitorConfig: MonitorConfig | undefined =
    typeof source === 'string' && utcOffset == null ? cronExpressionToMonitorConfig(source, timeZone, 'or') : undefined;
  for (const callback of job._callbacks || []) {
    updateMonitorConfig(callback, monitorConfig);
  }
}

// `new CronJob(cronTime, onTick, onComplete, start, timeZone, context, runOnInit, utcOffset, ..., name)`
function wrapJob(args: unknown[], options: CronJobIntegrationOptions): void {
  const [cronTime, onTick, , , timeZone] = args;
  const utcOffset = args[7];
  const name = args[11];
  if (typeof cronTime !== 'string' || !shouldMonitorJob(name, onTick, options.excludeJobs)) {
    return;
  }
  const monitorConfig = utcOffset == null ? cronExpressionToMonitorConfig(cronTime, timeZone, 'or') : undefined;
  args[1] = wrapScheduledJob(onTick as AnyFn, name, monitorConfig, 'auto.function.cron');
}
