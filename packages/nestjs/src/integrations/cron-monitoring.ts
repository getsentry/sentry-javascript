import type { Client, MonitorConfig } from '@sentry/core';
import { debug, getClient, stringMatchesSomePattern } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { nestCronOptionsToMonitorConfig } from '../decorators';
import type { AnyFn } from './helpers';
import { isSentryCronMethod } from './helpers';

export interface NestCronMonitoringOptions {
  /**
   * Send check-ins for every `@Cron()` method of `@nestjs/schedule`. The monitor slug is the `name`
   * option of `@Cron()`, or `ClassName.methodName`. Methods with `@SentryCron()` keep their own slug.
   * Methods whose schedule Sentry can't represent, like every 10 seconds, are not monitored.
   *
   * Defaults to `false`.
   */
  monitorCronJobs?: boolean;

  /**
   * Monitor slugs not to monitor when `monitorCronJobs` is enabled. Strings must match the slug exactly.
   */
  excludeCronJobs?: Array<string | RegExp>;
}

interface CronMonitor {
  slug: string;
  config: MonitorConfig;
}

const MONITORING_OPTIONS = new WeakMap<Client, NestCronMonitoringOptions>();

/** Enables `@Cron()` monitoring for the client. */
export function setCronMonitoringOptions(client: Client, options: NestCronMonitoringOptions): void {
  if (options.monitorCronJobs) {
    MONITORING_OPTIONS.set(client, options);
  }
}

/**
 * Returns a function that resolves the monitor for a `@Cron()` method on each run,
 * or `undefined` if the run should not be monitored.
 */
export function makeCronMonitorResolver(
  cronArgs: unknown[],
  target: unknown,
  propertyKey: string | symbol | undefined,
  scheduleVersion?: string,
): (handler: AnyFn, wrapped: AnyFn) => CronMonitor | undefined {
  let monitor: CronMonitor | null | undefined;

  return (handler, wrapped) => {
    const client = getClient();
    const options = client && MONITORING_OPTIONS.get(client);
    if (!options || isSentryCronMethod(handler) || isSentryCronMethod(wrapped)) {
      return undefined;
    }

    if (monitor === undefined) {
      try {
        monitor = getCronMonitor(cronArgs, target, propertyKey, scheduleVersion);
      } catch (e) {
        DEBUG_BUILD && debug.error('[Nest] Failed to set up the cron monitor:', e);
        monitor = null;
      }
    }

    if (!monitor || stringMatchesSomePattern(monitor.slug, options.excludeCronJobs, true)) {
      return undefined;
    }
    return monitor;
  };
}

function getCronMonitor(
  [cronTime, cronOptions]: unknown[],
  target: unknown,
  propertyKey: string | symbol | undefined,
  scheduleVersion: string | undefined,
): CronMonitor | null {
  // A `Date` runs once, so there is nothing to monitor.
  if (typeof cronTime !== 'string') {
    return null;
  }

  const options = (cronOptions && typeof cronOptions === 'object' ? cronOptions : {}) as Record<string, unknown>;
  const className = (target as { constructor?: { name?: unknown } } | undefined)?.constructor?.name;
  const slug =
    typeof options.name === 'string' && options.name
      ? options.name
      : typeof className === 'string' && className && propertyKey !== undefined
        ? `${className}.${String(propertyKey)}`
        : undefined;

  if (!slug) {
    DEBUG_BUILD && debug.warn('[Nest] Not monitoring a @Cron() method without a name.');
    return null;
  }

  const config = nestCronOptionsToMonitorConfig({ ...options, cronTime }, scheduleVersion);
  if (!config) {
    DEBUG_BUILD && debug.log(`[Nest] Not monitoring ${slug}: Sentry can't represent its schedule.`);
    return null;
  }

  return { slug, config };
}
