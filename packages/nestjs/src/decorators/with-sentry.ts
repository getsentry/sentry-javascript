import { captureException } from '@sentry/core';
import { isExpectedError } from '../helpers';

/**
 * A decorator to wrap user-defined exception filters and add Sentry error reporting.
 */
export function WithSentry() {
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
