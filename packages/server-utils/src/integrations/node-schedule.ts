import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { nodeScheduleModuleNames } from '../orchestrion/config/node-schedule';
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

const INTEGRATION_NAME = 'NodeSchedule' as const;

export interface NodeScheduleIntegrationOptions {
  /** Job names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

const _nodeScheduleIntegration = ((options: NodeScheduleIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, nodeScheduleModuleNames, subscribe, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for every named `node-schedule` job created with `scheduleJob`.
 * The monitor slug is the job name; jobs without a name, and one-off jobs, are not monitored.
 */
export const nodeScheduleIntegration = defineIntegration(_nodeScheduleIntegration);

function subscribe(options: NodeScheduleIntegrationOptions): void {
  subscribeToJobCreation(CHANNELS.NODE_SCHEDULE_SCHEDULE_JOB, INTEGRATION_NAME, args => wrapJob(args, options));
  subscribeToScheduleChange(CHANNELS.NODE_SCHEDULE_RESCHEDULE, INTEGRATION_NAME, onReschedule);
}

/** Sends the new spec's config after `job.reschedule(spec)`, which `rescheduleJob` calls. */
export function onReschedule({ arguments: [spec], self, result }: ScheduleChange): void {
  // node-schedule keeps the old schedule when this returns false.
  if (result === true) {
    updateMonitorConfig((self as { job?: unknown } | undefined)?.job, getMonitorConfig(spec));
  }
}

// `scheduleJob([name], spec, method, [callback])`, like node-schedule reads it.
function wrapJob(args: unknown[], options: NodeScheduleIntegrationOptions): void {
  const name = args.length >= 3 && typeof args[0] === 'string' ? args[0] : undefined;
  const [spec, method] = name ? [args[1], args[2]] : [args[0], args[1]];
  if (isOneOffSpec(spec) || !shouldMonitorJob(name, method, options.excludeJobs)) {
    return;
  }
  args[2] = wrapScheduledJob(method as AnyFn, name, getMonitorConfig(spec), 'auto.function.node-schedule');
}

/** Whether node-schedule runs a job with this spec once: a `Date`, a timestamp, or a date string. */
export function isOneOffSpec(spec: unknown): boolean {
  const { rule } = (spec || {}) as { rule?: unknown };
  const when = typeof spec === 'object' && rule ? rule : spec;
  if (typeof when === 'string') {
    // `Date.parse` also accepts some crons, like `0 9 * * *`.
    return !isCronShaped(when) && !Number.isNaN(Date.parse(when));
  }
  return when instanceof Date || typeof when === 'number';
}

function isCronShaped(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  return (
    /^@[a-z]+$/i.test(value.trim()) ||
    ((fields.length === 5 || fields.length === 6) && fields.every(field => /^[\d*,/?#a-z-]+$/i.test(field)))
  );
}

// Only cron strings are sent; recurrence rules and rules limited by `start` or `end` check in without a config.
export function getMonitorConfig(spec: unknown): MonitorConfig | undefined {
  if (typeof spec === 'string') {
    return cronExpressionToMonitorConfig(spec, undefined, 'or');
  }
  const { rule, tz, start, end } = (spec || {}) as { rule?: unknown; tz?: unknown; start?: unknown; end?: unknown };
  return typeof rule === 'string' && !start && !end ? cronExpressionToMonitorConfig(rule, tz, 'or') : undefined;
}
