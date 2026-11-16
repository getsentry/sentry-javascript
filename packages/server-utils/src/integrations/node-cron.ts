import type { IntegrationFn, MonitorConfig } from '@sentry/core';
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

const _nodeCronIntegration = ((options: NodeCronIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, nodeCronModuleNames, subscribe, [options], {
        // The binding only parents spans, and this integration creates none.
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Sends Crons check-ins for every named `node-cron` task, with its schedule as the monitor config.
 * The monitor slug is the task's `name` option. Tasks without a name, or with a schedule Sentry can't express, are not
 * monitored.
 */
export const nodeCronIntegration = defineIntegration(_nodeCronIntegration);

function subscribe(options: NodeCronIntegrationOptions): void {
  subscribeToJobCreation(CHANNELS.NODE_CRON_CREATE_TASK, INTEGRATION_NAME, args => wrapTask(args, options));
  subscribeToJobCreation(CHANNELS.NODE_CRON_V4_CREATE_TASK, INTEGRATION_NAME, args =>
    wrapTask(args, options, isReadAlikeByNodeCron4),
  );
  subscribeToJobCreation(CHANNELS.NODE_CRON_V3_CREATE_TASK, INTEGRATION_NAME, args =>
    wrapTask(args, options, isReadAlikeByNodeCron3),
  );
}

// `createTask(expression, func, options)`
function wrapTask(
  args: unknown[],
  options: NodeCronIntegrationOptions,
  isReadAlike?: (expression: string) => boolean,
): void {
  const [expression, func, taskOptions] = args;
  const { name, timezone } = (taskOptions || {}) as { name?: unknown; timezone?: unknown };
  if (!shouldMonitorJob(name, func, options.excludeJobs)) {
    return;
  }
  const monitorConfig = getMonitorConfig(String(expression), timezone, isReadAlike);
  args[1] = wrapScheduledJob(func as AnyFn, name, monitorConfig, 'auto.function.node-cron');
}

/** The monitor config for a task, or `undefined` if `isReadAlike` says this node-cron version reads it differently. */
export function getMonitorConfig(
  expression: string,
  timezone: unknown,
  isReadAlike?: (expression: string) => boolean,
): MonitorConfig | undefined {
  return isReadAlike && !isReadAlike(expression)
    ? undefined
    : cronExpressionToMonitorConfig(expression, timezone, 'and');
}

const NODE_CRON_3_FIELD_MINIMUMS = [0, 0, 1, 1, 0];

/**
 * node-cron before 4.6 reads `7` as `0` and swaps reversed ranges, so it runs `sat-sun`, `6-0` and `6-7` every day.
 * Returns `false` for weekday ranges that could hit that.
 */
export function isReadAlikeByNodeCron4(expression: string): boolean {
  const weekday = expression.trim().split(/\s+/).pop() || '';
  return !(weekday.includes('-') && (weekday.includes('7') || /-(?:0|sun)/i.test(weekday)));
}

/**
 * node-cron 3 keeps the values of a stepped field that are multiples of the step (`*\/2` days are 2, 4, ...)
 * and reads weekday ranges like node-cron 4 before 4.6. Returns `false` where that differs from standard cron.
 */
export function isReadAlikeByNodeCron3(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  const minimums = fields.length === 6 ? [0, ...NODE_CRON_3_FIELD_MINIMUMS] : NODE_CRON_3_FIELD_MINIMUMS;
  return (
    isReadAlikeByNodeCron4(expression) &&
    fields.every((field, index) => {
      if (!field.includes('/')) {
        return true;
      }
      const match = /^(?:\*|(\d+)-\d+)\/(\d+)$/.exec(field);
      return !!match && Number(match[1] ?? minimums[index]) % Number(match[2]) === 0;
    })
  );
}
