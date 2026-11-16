import type { Client, MonitorConfig } from '@sentry/core';
import { debug, getClient, stringMatchesSomePattern } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { nestCronOptionsToMonitorConfig } from '../decorators';
import { getCronOptions, isSentryCronMethod, markSentryCronMethod } from './helpers';

export interface NestCronMonitoringOptions {
  /**
   * Send check-ins for every `@Cron()` method of `@nestjs/schedule`. The monitor slug is the `name`
   * option of `@Cron()`, or `ClassName.methodName`. Methods with `@SentryCron()` keep their own slug.
   * Methods whose schedule Sentry can't represent, like every 10 seconds, are not monitored.
   * Sentry cuts slugs off at 50 characters, so give `@Cron()` a `name` if the class and method names are long.
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

const CRON_MONITORS = new WeakMap<object, (method: object) => CronMonitor | undefined>();

/**
 * Sets up `monitorCronJobs` for a method `@Cron()` just decorated, keyed by its `@Cron()` options, which
 * decorators above it copy. A `@SentryCron()` below marks the options instead, so the method keeps its own slug.
 */
export function registerCronMonitor(
  method: object,
  handler: object,
  cronArgs: unknown[],
  target: unknown,
  propertyKey: string | symbol | undefined,
  scheduleVersion?: string,
): void {
  if (isSentryCronMethod(handler)) {
    markSentryCronMethod(method);
    return;
  }
  const options = getCronOptions(method);
  if (options) {
    CRON_MONITORS.set(options, makeCronMonitorResolver(cronArgs, target, propertyKey, scheduleVersion));
  }
}

/** The monitor a run of this `@Cron()` method sends check-ins for, if any. */
export function resolveCronMonitor(method: object): CronMonitor | undefined {
  const options = getCronOptions(method);
  return options && CRON_MONITORS.get(options)?.(method);
}

function makeCronMonitorResolver(
  cronArgs: unknown[],
  target: unknown,
  propertyKey: string | symbol | undefined,
  scheduleVersion: string | undefined,
): (method: object) => CronMonitor | undefined {
  let monitor: CronMonitor | null | undefined;

  return method => {
    const client = getClient();
    const options = client && MONITORING_OPTIONS.get(client);
    if (!options) {
      return undefined;
    }

    if (monitor === undefined) {
      try {
        monitor = isSentryCronMethod(method) ? null : getCronMonitor(cronArgs, target, propertyKey, scheduleVersion);
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
