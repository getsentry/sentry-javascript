import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, stringMatchesSomePattern } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { nodeCronModuleNames } from '../orchestrion/config/node-cron';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn } from '../utils/cronMonitoring';
import { cronExpressionToMonitorConfig, wrapScheduledJob } from '../utils/cronMonitoring';

const INTEGRATION_NAME = 'NodeCron' as const;

// Set by `Sentry.cron.instrumentNodeCron`, which already sends check-ins.
const MONITORED = Symbol.for('sentry.cron.monitored');

export interface NodeCronIntegrationOptions {
  /** Task names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

const NOOP = (): void => {};

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
  diagnosticsChannel.tracingChannel<{ arguments: unknown[] }>(CHANNELS.NODE_CRON_CREATE_TASK).subscribe({
    start(data) {
      try {
        const [expression, func, taskOptions] = data.arguments;
        const { name, timezone } = (taskOptions || {}) as { name?: unknown; timezone?: unknown };
        if (
          typeof func !== 'function' ||
          (func as { [MONITORED]?: boolean })[MONITORED] ||
          typeof name !== 'string' ||
          !name ||
          stringMatchesSomePattern(name, options.excludeJobs, true)
        ) {
          return;
        }
        data.arguments[1] = wrapScheduledJob(
          func as AnyFn,
          name,
          cronExpressionToMonitorConfig(String(expression), timezone, 'and'),
          'auto.function.node-cron',
        );
      } catch (e) {
        DEBUG_BUILD && debug.error('[NodeCron] Failed to set up the cron monitor:', e);
      }
    },
    end: NOOP,
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}
