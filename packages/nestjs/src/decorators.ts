import type { MonitorConfig } from '@sentry/core';
import { CODE_FUNCTION_NAME, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { captureException } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { startSpan } from '@sentry/node';
import { isExpectedError } from './helpers';
import type { ReflectWithMetadata } from './integrations/helpers';
import { copyReflectMetadata } from './integrations/helpers';

/**
 * Monitor settings for `@SentryCron` that take the schedule and time zone from the `@Cron()`
 * decorator of `@nestjs/schedule` on the same method.
 */
export type SentryCronFromCronDecoratorConfig = Omit<MonitorConfig, 'schedule' | 'timezone'> & {
  fromCronDecorator: true;
};

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 *
 * Pass `{ fromCronDecorator: true }` instead of a monitor config to send the schedule and time
 * zone of the method's `@Cron()` decorator, so Sentry can create the monitor on the first check-in.
 */
export const SentryCron = (
  monitorSlug: string,
  monitorConfig?: MonitorConfig | SentryCronFromCronDecoratorConfig,
): MethodDecorator => {
  return (target: unknown, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    let resolvedMonitorConfig: MonitorConfig | undefined;
    let resolved = false;

    const wrappedMethod = function (this: unknown, ...args: unknown[]): unknown {
      if (!resolved) {
        resolved = true;
        resolvedMonitorConfig = isFromCronDecoratorConfig(monitorConfig)
          ? // `@Cron()` sets its metadata on whatever function is `descriptor.value` when it runs, which is
            // this function if it is applied after `@SentryCron()`, so it is only readable at call time.
            getMonitorConfigFromNestCron(monitorConfig, [
              wrappedMethod,
              (target as Record<PropertyKey, unknown> | undefined)?.[propertyKey],
            ])
          : monitorConfig;
      }

      return Sentry.withMonitor(
        monitorSlug,
        () => {
          return originalMethod.apply(this, args);
        },
        resolvedMonitorConfig,
      );
    };

    descriptor.value = wrappedMethod;

    copyFunctionNameAndMetadata({ originalMethod, descriptor });

    return descriptor;
  };
};

function isFromCronDecoratorConfig(
  monitorConfig: MonitorConfig | SentryCronFromCronDecoratorConfig | undefined,
): monitorConfig is SentryCronFromCronDecoratorConfig {
  return !!monitorConfig && 'fromCronDecorator' in monitorConfig && monitorConfig.fromCronDecorator === true;
}

const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';

interface NestCronOptions {
  cronTime?: unknown;
  timeZone?: unknown;
  utcOffset?: unknown;
}

function getMonitorConfigFromNestCron(
  { fromCronDecorator: _, ...monitorSettings }: SentryCronFromCronDecoratorConfig,
  candidates: unknown[],
): MonitorConfig | undefined {
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
      const cronConfig = nestCronOptionsToMonitorConfig(cronOptions);
      return cronConfig && { ...monitorSettings, ...cronConfig };
    }
  }

  return undefined;
}

/**
 * Converts the options `@Cron()` stores as metadata into a Sentry monitor config.
 * Returns `undefined` for schedules Sentry can't represent.
 */
function nestCronOptionsToMonitorConfig(cronOptions: NestCronOptions): MonitorConfig | undefined {
  const { cronTime, timeZone, utcOffset } = cronOptions;

  // A fixed UTC offset has no IANA time zone equivalent.
  if (typeof cronTime !== 'string' || utcOffset != null) {
    return undefined;
  }

  const fields = cronTime.trim().split(/\s+/);
  let crontab: string | undefined;
  if (fields.length === 5) {
    crontab = fields.join(' ');
  } else if (fields.length === 6 && /^\d+$/.test(fields[0] as string)) {
    // Sentry schedules have minute granularity, so only a fixed second can be dropped.
    crontab = fields.slice(1).join(' ');
  }

  if (!crontab) {
    return undefined;
  }

  return {
    schedule: { type: 'crontab', value: crontab },
    ...(typeof timeZone === 'string' && timeZone ? { timezone: timeZone } : {}),
  };
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
