import { captureException } from '@sentry/core';
import type { MonitorConfig } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { startSpan } from '@sentry/node';
import { isExpectedError } from './helpers';

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 */
export const SentryCron = (monitorSlug: string, monitorConfig?: MonitorConfig): MethodDecorator => {
  return (target: unknown, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = function (...args: unknown[]) {
      return Sentry.withMonitor(
        monitorSlug,
        () => {
          return originalMethod.apply(this, args);
        },
        monitorConfig,
      );
    };
    return descriptor;
  };
};

/**
 * A decorator usable to wrap arbitrary functions with spans.
 */
export function SentryTraced(op: string = 'function') {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown> | unknown; // function can be sync or async

    descriptor.value = function (...args: unknown[]) {
      return startSpan(
        {
          op: op,
          name: propertyKey,
        },
        () => {
          return originalMethod.apply(this, args);
        },
      );
    };

    // preserve the original name on the decorated function
    Object.defineProperty(descriptor.value, 'name', {
      value: originalMethod.name,
      configurable: true,
      enumerable: true,
      writable: true,
    });

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

      captureException(exception);
      return originalCatch.apply(this, [exception, host, ...args]);
    };

    return descriptor;
  };
}
