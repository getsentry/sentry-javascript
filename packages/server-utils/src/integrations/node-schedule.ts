import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { nodeScheduleModuleNames } from '../orchestrion/config/node-schedule';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn } from '../utils/cronMonitoring';
import {
  cronExpressionToMonitorConfig,
  shouldMonitorJob,
  subscribeToJobCreation,
  wrapScheduledJob,
} from '../utils/cronMonitoring';

const INTEGRATION_NAME = 'NodeSchedule' as const;

export interface NodeScheduleIntegrationOptions {
  /** Job names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

let options: NodeScheduleIntegrationOptions = {};

const _nodeScheduleIntegration = ((integrationOptions: NodeScheduleIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      options = integrationOptions;
      invokeOrchestrionInstrumentation(client, nodeScheduleModuleNames, subscribe, [], {
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

function subscribe(): void {
  subscribeToJobCreation(CHANNELS.NODE_SCHEDULE_SCHEDULE_JOB, INTEGRATION_NAME, wrapJob);
}

// `scheduleJob([name], spec, method, [callback])`, like node-schedule reads it.
function wrapJob(args: unknown[]): void {
  const name = args.length >= 3 && typeof args[0] === 'string' ? args[0] : undefined;
  const [spec, method] = name ? [args[1], args[2]] : [args[0], args[1]];
  if (spec instanceof Date || !shouldMonitorJob(name, method, options.excludeJobs)) {
    return;
  }
  args[2] = wrapScheduledJob(method as AnyFn, name, getMonitorConfig(spec), 'auto.function.node-schedule');
}

// Only cron strings are sent; recurrence rules and rules limited by `start` or `end` check in without a config.
function getMonitorConfig(spec: unknown): MonitorConfig | undefined {
  if (typeof spec === 'string') {
    return cronExpressionToMonitorConfig(spec, undefined, 'or');
  }
  const { rule, tz, start, end } = (spec || {}) as { rule?: unknown; tz?: unknown; start?: unknown; end?: unknown };
  return typeof rule === 'string' && !start && !end ? cronExpressionToMonitorConfig(rule, tz, 'or') : undefined;
}
