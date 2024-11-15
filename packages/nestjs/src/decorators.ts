import * as Sentry from '@sentry/node';
import type { MonitorConfig } from '@sentry/types';
import { captureException } from '@sentry/core';
import { isExpectedError } from './helpers';
import { startSpan } from '@sentry/node';

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 */
export const SentryCron = (monitorSlug: string, monitorConfig?: MonitorConfig): MethodDecorator => {
  return (target: unknown, propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalMethod = descriptor.value as (...args: any[]) => Promise<any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = function (...args: any[]) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalMethod = descriptor.value as (...args: any[]) => Promise<any> | any; // function can be sync or async

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = function (...args: any[]) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalCatch = descriptor.value as (exception: unknown, host: unknown, ...args: any[]) => void;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = function (exception: unknown, host: unknown, ...args: any[]) {
      if (isExpectedError(exception)) {
        return originalCatch.apply(this, [exception, host, ...args]);
      }

      captureException(exception);
      return originalCatch.apply(this, [exception, host, ...args]);
    };

    return descriptor;
  };
}

/**
 * A decorator to wrap user-defined exception filters and add Sentry error reporting.
 *
 * @deprecated This decorator was renamed and will be removed in a future major version. Use `SentryExceptionCaptured` instead.
 */
export const WithSentry = SentryExceptionCaptured;
