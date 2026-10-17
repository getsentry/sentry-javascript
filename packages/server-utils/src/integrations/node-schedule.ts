import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, MonitorConfig } from '@sentry/core';
import { debug, defineIntegration, stringMatchesSomePattern } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { nodeScheduleModuleNames } from '../orchestrion/config/node-schedule';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn } from '../utils/cronMonitoring';
import { cronExpressionToMonitorConfig, wrapScheduledJob } from '../utils/cronMonitoring';

const INTEGRATION_NAME = 'NodeSchedule' as const;

// Set by `Sentry.cron.instrumentNodeSchedule`, which already sends check-ins.
const MONITORED = Symbol.for('sentry.cron.monitored');

const NOOP = (): void => {};

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
  diagnosticsChannel.tracingChannel<{ arguments: unknown[] }>(CHANNELS.NODE_SCHEDULE_SCHEDULE_JOB).subscribe({
    start(data) {
      try {
        // `scheduleJob([name], spec, method, [callback])`, like node-schedule reads it.
        const args = data.arguments;
        const name = args.length >= 3 && typeof args[0] === 'string' ? args[0] : undefined;
        const [spec, method] = name ? [args[1], args[2]] : [args[0], args[1]];
        if (
          !name ||
          typeof method !== 'function' ||
          (method as { [MONITORED]?: boolean })[MONITORED] ||
          spec instanceof Date ||
          stringMatchesSomePattern(name, options.excludeJobs, true)
        ) {
          return;
        }
        args[2] = wrapScheduledJob(method as AnyFn, name, getMonitorConfig(spec), 'auto.function.node-schedule');
      } catch (e) {
        DEBUG_BUILD && debug.error('[NodeSchedule] Failed to set up the cron monitor:', e);
      }
    },
    end: NOOP,
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}

// Only cron strings are sent; recurrence rules check in without a config.
function getMonitorConfig(spec: unknown): MonitorConfig | undefined {
  if (typeof spec === 'string') {
    return cronExpressionToMonitorConfig(spec, undefined, 'or');
  }
  const { rule, tz } = (spec || {}) as { rule?: unknown; tz?: unknown };
  return typeof rule === 'string' ? cronExpressionToMonitorConfig(rule, tz, 'or') : undefined;
}
