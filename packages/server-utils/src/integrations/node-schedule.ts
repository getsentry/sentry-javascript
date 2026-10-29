import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { nodeScheduleModuleNames } from '../orchestrion/config/node-schedule';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn, ScheduleChange } from '../utils/cronMonitoring';
import {
  cronExpressionToMonitorConfig,
  shouldMonitorJob,
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
 * Sends Crons check-ins for every named `node-schedule` job, whether it's created with `scheduleJob` or `new Job()`.
 * The monitor slug is the job name; jobs without a name, and one-off jobs, are not monitored.
 */
export const nodeScheduleIntegration = defineIntegration(_nodeScheduleIntegration);

function subscribe(options: NodeScheduleIntegrationOptions): void {
  subscribeToScheduleChange(CHANNELS.NODE_SCHEDULE_SCHEDULE, INTEGRATION_NAME, onSchedule, change =>
    beforeSchedule(change, options),
  );
}

interface Job {
  name?: unknown;
  job?: unknown;
  nextInvocation?: () => unknown;
}

// The name node-schedule gives jobs created without one.
const ANONYMOUS_NAME = /^<Anonymous Job \d+[ >]/;

// `job.schedule(spec)` calls that add to runs the job already has pending, rather than replace them.
const addsToPendingRuns = new WeakSet<ScheduleChange>();

/** Wraps a named job's method before `job.schedule(spec)` with a recurring spec, unless it's already wrapped. */
export function beforeSchedule(change: ScheduleChange, options: NodeScheduleIntegrationOptions): void {
  const job = change.self as Job | undefined;
  if (!job) {
    return;
  }
  if (typeof job.nextInvocation === 'function' && job.nextInvocation() != null) {
    addsToPendingRuns.add(change);
  }
  const name = typeof job.name === 'string' && !ANONYMOUS_NAME.test(job.name) ? job.name : undefined;
  if (isOneOffSpec(change.arguments[0]) || !shouldMonitorJob(name, job.job, options.excludeJobs)) {
    return;
  }
  job.job = wrapScheduledJob(job.job as AnyFn, name, undefined, 'auto.function.node-schedule');
}

/** Sends the spec's config after `job.schedule(spec)`, or none when the job also keeps runs from an earlier spec. */
export function onSchedule(change: ScheduleChange): void {
  // `schedule` returns false when it scheduled nothing, and `reschedule` then keeps the old schedule.
  if (change.result === true) {
    const job = change.self as Job | undefined;
    updateMonitorConfig(job?.job, addsToPendingRuns.has(change) ? undefined : getMonitorConfig(change.arguments[0]));
  }
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
