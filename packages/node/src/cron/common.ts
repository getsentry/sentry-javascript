import type { MonitorConfig } from '@sentry/core';
import { debug } from '@sentry/core';
import type { CronDialect } from '@sentry/server-utils';
import { cronExpressionToMonitorConfig } from '@sentry/server-utils';
import { DEBUG_BUILD } from '../debug-build';

/**
 * The monitor config for a cron expression, or `undefined` if Sentry would read the expression differently than the
 * scheduler runs it.
 */
export function getCronMonitorConfig(
  expression: string,
  timezone: unknown,
  dialect: CronDialect,
  isReadAlike: (expression: string) => boolean = () => true,
): MonitorConfig | undefined {
  const monitorConfig = isReadAlike(expression)
    ? cronExpressionToMonitorConfig(expression, timezone, dialect)
    : undefined;
  if (!monitorConfig) {
    DEBUG_BUILD &&
      debug.warn(
        `[Cron] Can't convert "${expression}" to a Sentry schedule, sending check-ins without a monitor config.`,
      );
  }
  return monitorConfig;
}
