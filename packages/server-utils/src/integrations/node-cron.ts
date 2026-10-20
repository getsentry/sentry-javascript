import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { nodeCronModuleNames } from '../orchestrion/config/node-cron';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn } from '../utils/cronMonitoring';
import {
  cronExpressionToMonitorConfig,
  shouldMonitorJob,
  subscribeToJobCreation,
  wrapScheduledJob,
} from '../utils/cronMonitoring';

const INTEGRATION_NAME = 'NodeCron' as const;

export interface NodeCronIntegrationOptions {
  /** Task names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

let options: NodeCronIntegrationOptions = {};

const _nodeCronIntegration = ((integrationOptions: NodeCronIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      options = integrationOptions;
      invokeOrchestrionInstrumentation(client, nodeCronModuleNames, subscribe, [], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for every named `node-cron` task, with its schedule as the monitor config.
 * The monitor slug is the task's `name` option; tasks without a name are not monitored.
 */
export const nodeCronIntegration = defineIntegration(_nodeCronIntegration);

function subscribe(): void {
  subscribeToJobCreation(CHANNELS.NODE_CRON_CREATE_TASK, INTEGRATION_NAME, args => wrapTask(args, false));
  subscribeToJobCreation(CHANNELS.NODE_CRON_V3_CREATE_TASK, INTEGRATION_NAME, args => wrapTask(args, true));
}

// `createTask(expression, func, options)`
function wrapTask(args: unknown[], isNodeCron3: boolean): void {
  const [expression, func, taskOptions] = args;
  const { name, timezone } = (taskOptions || {}) as { name?: unknown; timezone?: unknown };
  if (!shouldMonitorJob(name, func, options.excludeJobs)) {
    return;
  }
  const monitorConfig =
    isNodeCron3 && !isReadAlikeByNodeCron3(String(expression))
      ? undefined
      : cronExpressionToMonitorConfig(String(expression), timezone, 'and');
  args[1] = wrapScheduledJob(func as AnyFn, name, monitorConfig, 'auto.function.node-cron');
}

const NODE_CRON_3_FIELD_MINIMUMS = [0, 0, 1, 1, 0];

/**
 * node-cron 3 keeps the values of a stepped field that are multiples of the step (`*\/2` days are 2, 4, ...)
 * and reads `7` in a weekday range as `0`. Returns `false` where that differs from standard cron.
 */
export function isReadAlikeByNodeCron3(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  const minimums = fields.length === 6 ? [0, ...NODE_CRON_3_FIELD_MINIMUMS] : NODE_CRON_3_FIELD_MINIMUMS;
  const weekday = fields[fields.length - 1] || '';
  if (weekday.includes('-') && weekday.includes('7')) {
    return false;
  }
  return fields.every((field, index) => {
    if (!field.includes('/')) {
      return true;
    }
    const match = /^(?:\*|(\d+)-\d+)\/(\d+)$/.exec(field);
    return !!match && Number(match[1] ?? minimums[index]) % Number(match[2]) === 0;
  });
}
