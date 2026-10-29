import type { MonitorConfig } from '@sentry/core';
import { CODE_FUNCTION_NAME, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { captureException, debug } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { startSpan } from '@sentry/node';
import { DEBUG_BUILD } from './debug-build';
import { isExpectedError } from './helpers';
import type { ReflectWithMetadata } from './integrations/helpers';
import { copyReflectMetadata, getNestScheduleVersion } from './integrations/helpers';

/**
 * Monitor settings for `@SentryCron` whose schedule and time zone come from the `@Cron()` decorator
 * of `@nestjs/schedule` on the same method. Set `fromCronDecorator: false` to not send them.
 */
export type SentryCronMonitorSettings = Omit<MonitorConfig, 'schedule' | 'timezone'> & {
  schedule?: never;
  timezone?: never;
  fromCronDecorator?: boolean;
};

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 *
 * Unless a monitor config with a `schedule` is passed, the schedule and time zone of the method's
 * `@Cron()` decorator are sent with each check-in, so Sentry can create the monitor on the first run.
 */
export const SentryCron = (
  monitorSlug: string,
  monitorConfig?: (MonitorConfig & { fromCronDecorator?: never }) | SentryCronMonitorSettings,
): MethodDecorator => {
  return (target: unknown, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    let resolvedMonitorConfig: MonitorConfig | undefined;
    let isolateTraceWithoutConfig = false;
    let resolved = false;

    const wrappedMethod = function (this: unknown, ...args: unknown[]): unknown {
      if (!resolved) {
        resolved = true;
        // A `@Cron()` applied after `@SentryCron()` puts its metadata on this wrapper, so read it at call time.
        resolvedMonitorConfig = resolveMonitorConfig(monitorSlug, monitorConfig, [
          wrappedMethod,
          (target as Record<PropertyKey, unknown> | undefined)?.[propertyKey],
        ]);
        isolateTraceWithoutConfig = !resolvedMonitorConfig && !!monitorConfig?.isolateTrace;
      }

      const runWithMonitor = (): unknown =>
        Sentry.withMonitor(
          monitorSlug,
          () => {
            return originalMethod.apply(this, args);
          },
          resolvedMonitorConfig,
        );

      // `withMonitor` reads `isolateTrace` from the monitor config, which is not sent without a schedule.
      return isolateTraceWithoutConfig ? Sentry.startNewTrace(runWithMonitor) : runWithMonitor();
    };

    descriptor.value = wrappedMethod;

    copyFunctionNameAndMetadata({ originalMethod, descriptor });

    return descriptor;
  };
};

function resolveMonitorConfig(
  monitorSlug: string,
  monitorConfig: MonitorConfig | SentryCronMonitorSettings | undefined,
  candidates: unknown[],
): MonitorConfig | undefined {
  if (monitorConfig?.schedule) {
    return monitorConfig;
  }

  const { fromCronDecorator = true, ...monitorSettings } = monitorConfig || {};
  const cronConfig = fromCronDecorator ? getMonitorConfigFromNestCron(candidates) : undefined;

  if (!cronConfig) {
    const { isolateTrace: _isolateTrace, ...unsentSettings } = monitorSettings;
    if (DEBUG_BUILD && Object.keys(unsentSettings).length) {
      const reason = fromCronDecorator
        ? 'no schedule could be taken from @Cron()'
        : 'fromCronDecorator is false and no schedule was passed';
      debug.warn(
        `[SentryCron] The monitor settings for "${monitorSlug}" are not sent, because ${reason}. A monitor config needs a schedule.`,
      );
    }
    return undefined;
  }

  return { ...monitorSettings, ...cronConfig };
}

const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';

// `cron` presets (case-insensitive). Sentry accepts only the first five, so the others are sent as crontabs.
const CRON_PRESETS: Record<string, string | undefined> = {
  '@yearly': '@yearly',
  '@monthly': '@monthly',
  '@weekly': '@weekly',
  '@daily': '@daily',
  '@hourly': '@hourly',
  '@minutely': '* * * * *',
  '@weekdays': '0 0 * * 1-5',
  '@weekends': '0 0 * * 0,6',
};

interface NestCronOptions {
  cronTime?: unknown;
  timeZone?: unknown;
  utcOffset?: unknown;
}

function getMonitorConfigFromNestCron(candidates: unknown[]): MonitorConfig | undefined {
  const R = Reflect as ReflectWithMetadata;
  if (typeof R.getMetadata !== 'function') {
    return undefined;
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'function') {
      continue;
    }
    const cronOptions = R.getMetadata(SCHEDULE_CRON_OPTIONS, candidate);
    if (cronOptions && typeof cronOptions === 'object') {
      return nestCronOptionsToMonitorConfig(cronOptions, getNestScheduleVersion(cronOptions));
    }
  }

  return undefined;
}

/**
 * Converts the options `@Cron()` stores as metadata into a Sentry monitor config.
 * Returns `undefined` for schedules Sentry can't represent.
 */
function nestCronOptionsToMonitorConfig(
  cronOptions: NestCronOptions,
  scheduleVersion: string | undefined,
): MonitorConfig | undefined {
  const { cronTime, timeZone, utcOffset } = cronOptions;

  // A fixed UTC offset has no IANA time zone equivalent.
  if (typeof cronTime !== 'string' || utcOffset != null) {
    return undefined;
  }

  const fields = cronTime.trim().split(/\s+/);
  let crontab: string | undefined;
  if (fields.length === 1) {
    crontab = CRON_PRESETS[(fields[0] as string).toLowerCase()];
  } else if (fields.length === 5) {
    crontab = isSupportedCrontab(fields, scheduleVersion) ? fields.join(' ') : undefined;
  } else if (fields.length === 6 && /^\d+$/.test(fields[0] as string)) {
    // Sentry schedules have minute granularity, so only a fixed second can be dropped.
    crontab = isSupportedCrontab(fields.slice(1), scheduleVersion) ? fields.slice(1).join(' ') : undefined;
  }

  if (!crontab) {
    return undefined;
  }

  // Without a `timeZone`, `cron` uses the server's time zone, but Sentry would assume UTC.
  const timezone = toSentryTimeZone(typeof timeZone === 'string' && timeZone ? timeZone : getLocalTimeZone());
  if (!timezone) {
    return undefined;
  }

  return {
    schedule: { type: 'crontab', value: crontab },
    timezone,
  };
}

/**
 * Whether Sentry reads the 5 crontab fields the same way `cron` (used by `@nestjs/schedule`) runs them.
 */
function isSupportedCrontab(
  [, , dayOfMonth = '', month = '', dayOfWeek = '']: string[],
  scheduleVersion: string | undefined,
): boolean {
  // `cron` 2.x (`@nestjs/schedule` 2 and 3) counts months from 0. Steps don't depend on that.
  const countsMonthsFromOne = parseInt(scheduleVersion ?? '', 10) >= 4;
  if (!countsMonthsFromOne && /\d/.test(month.replace(/\/\d+/g, ''))) {
    return false;
  }

  const daysOfMonth = countCronValues(dayOfMonth, 1, 31);
  const daysOfWeek = countCronValues(dayOfWeek, 0, 7);
  if (daysOfMonth === undefined || daysOfWeek === undefined) {
    return false;
  }

  // `cron` ignores a day field that covers every day (like `1-31` or `sun-sat`) and runs on either day field
  // otherwise. Sentry reads full ranges as they are and needs both day fields when one starts with `*` (like `*/2`).
  const allDaysOfMonth = daysOfMonth === 31;
  const allDaysOfWeek = daysOfWeek === 7;
  const cronRunsOnEither = !allDaysOfMonth && !allDaysOfWeek;
  const sentryRunsOnEither = !dayOfMonth.startsWith('*') && !dayOfWeek.startsWith('*');
  return (allDaysOfMonth && allDaysOfWeek) || cronRunsOnEither === sentryRunsOnEither;
}

const DAY_NAMES: Record<string, number | undefined> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * How many days a day field matches, expanded the way `cron` does it, or `undefined` if `cron` can't parse it.
 * Day of week `7` is Sunday, like `0`.
 */
function countCronValues(field: string, low: number, high: number): number | undefined {
  let unknownName = false;
  const numericField = field.replace(/[a-z]{1,3}/gi, name => {
    const value = DAY_NAMES[name.toLowerCase()];
    unknownName ||= value === undefined;
    return String(value);
  });
  if (unknownName) {
    return undefined;
  }

  const values = new Set<number>();
  for (const part of numericField.split(',')) {
    const match = part.match(/^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/);
    if (!match) {
      return undefined;
    }
    const [, wildcard, from, to, step] = match;
    const lower = wildcard ? low : Number(from);
    const upper = wildcard || (step && !to) ? high : Number(to ?? from);
    const increment = Number(step ?? 1);
    if (!increment || lower < low || upper > high || lower > upper) {
      return undefined;
    }
    for (let value = lower; value <= upper; value += increment) {
      values.add(high === 7 && value === 7 ? 0 : value);
    }
  }
  return values.size;
}

/**
 * The canonical IANA name of the time zone, or `undefined` if Sentry won't accept it (like `UTC+3`).
 */
function toSentryTimeZone(timezone: string | undefined): string | undefined {
  if (!timezone || timezone === 'Etc/Unknown' || /^(?:utc|gmt)?[+-]/i.test(timezone)) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function getLocalTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * A decorator usable to wrap arbitrary functions with spans.
 */
export function SentryTraced(op: string = 'function') {
  return function (_target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown> | unknown; // function can be sync or async

    descriptor.value = function (...args: unknown[]) {
      return startSpan(
        {
          op: op,
          name: propertyKey,
          attributes: {
            [SENTRY_ORIGIN]: 'auto.function.nestjs.sentry_traced',
            [SENTRY_OP]: op,
            [CODE_FUNCTION_NAME]: propertyKey,
          },
        },
        () => {
          return originalMethod.apply(this, args);
        },
      );
    };

    copyFunctionNameAndMetadata({ originalMethod, descriptor });

    return descriptor;
  };
}

/**
 * A decorator to wrap user-defined exception filters and add Sentry error reporting.
 */
export function SentryExceptionCaptured() {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalCatch = descriptor.value as (exception: unknown, host: unknown, ...args: unknown[]) => void;

    descriptor.value = function (exception: unknown, host: unknown, ...args: unknown[]) {
      if (isExpectedError(exception)) {
        return originalCatch.apply(this, [exception, host, ...args]);
      }

      captureException(exception, { mechanism: { handled: false, type: 'auto.function.nestjs.exception_captured' } });
      return originalCatch.apply(this, [exception, host, ...args]);
    };

    copyFunctionNameAndMetadata({ originalMethod: originalCatch, descriptor });

    return descriptor;
  };
}

/**
 * Copies the function name and metadata from the original method to the decorated method.
 * This ensures that the decorated method maintains the same name and metadata as the original.
 *
 * @param {Function} params.originalMethod - The original method being decorated
 * @param {PropertyDescriptor} params.descriptor - The property descriptor containing the decorated method
 */
function copyFunctionNameAndMetadata({
  originalMethod,
  descriptor,
}: {
  descriptor: PropertyDescriptor;
  originalMethod: (...args: unknown[]) => unknown;
}): void {
  // preserve the original name on the decorated function
  Object.defineProperty(descriptor.value, 'name', {
    value: originalMethod.name,
    configurable: true,
    enumerable: true,
    writable: true,
  });

  copyReflectMetadata(originalMethod, descriptor.value as object);
}
