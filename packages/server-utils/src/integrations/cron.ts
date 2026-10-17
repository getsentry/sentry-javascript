import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, stringMatchesSomePattern } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { cronModuleNames } from '../orchestrion/config/cron';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { AnyFn } from '../utils/cronMonitoring';
import { cronExpressionToMonitorConfig, wrapScheduledJob } from '../utils/cronMonitoring';

const INTEGRATION_NAME = 'CronJob' as const;

// Set by `Sentry.cron.instrumentCron`, which already sends check-ins.
const MONITORED = Symbol.for('sentry.cron.monitored');

const NOOP = (): void => {};

export interface CronJobIntegrationOptions {
  /** Job names not to monitor. Strings must match the name exactly. */
  excludeJobs?: Array<string | RegExp>;
}

let options: CronJobIntegrationOptions = {};

const _cronJobIntegration = ((integrationOptions: CronJobIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      options = integrationOptions;
      invokeOrchestrionInstrumentation(client, cronModuleNames, subscribe, [], {
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

function subscribe(): void {
  diagnosticsChannel.tracingChannel<{ arguments: unknown[] }>(CHANNELS.CRON_JOB_CONSTRUCTOR).subscribe({
    start(data) {
      try {
        // `new CronJob(cronTime, onTick, onComplete, start, timeZone, context, runOnInit, utcOffset, ..., name)`
        const args = data.arguments;
        const [cronTime, onTick, , , timeZone] = args;
        const utcOffset = args[7];
        const name = args[11];
        if (
          typeof name !== 'string' ||
          !name ||
          typeof onTick !== 'function' ||
          (onTick as { [MONITORED]?: boolean })[MONITORED] ||
          typeof cronTime !== 'string' ||
          stringMatchesSomePattern(name, options.excludeJobs, true)
        ) {
          return;
        }
        const monitorConfig = utcOffset == null ? cronExpressionToMonitorConfig(cronTime, timeZone, 'or') : undefined;
        args[1] = wrapScheduledJob(onTick as AnyFn, name, monitorConfig, 'auto.function.cron');
      } catch (e) {
        DEBUG_BUILD && debug.error('[CronJob] Failed to set up the cron monitor:', e);
      }
    },
    end: NOOP,
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}
