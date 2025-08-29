import type { MonitorConfig } from '@sentry/core';
import {
  captureException,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';
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
          let result;
          try {
            result = originalMethod.apply(this, args);
          } catch (e) {
            captureException(e, { mechanism: { handled: false, type: 'auto.cron.nestjs' } });
            throw e;
          }
          if (isThenable(result)) {
            return result.then(undefined, e => {
              captureException(e, { mechanism: { handled: false, type: 'auto.cron.nestjs.async' } });
              throw e;
            });
          }
          return result;
        },
        monitorConfig,
      );
    };

    copyFunctionNameAndMetadata({ originalMethod, descriptor });

    return descriptor;
  };
};

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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nestjs.sentry_traced',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
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

  // copy metadata
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
  if (typeof Reflect !== 'undefined' && typeof Reflect.getMetadataKeys === 'function') {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
    const originalMetaData = Reflect.getMetadataKeys(originalMethod);
    for (const key of originalMetaData) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
      const value = Reflect.getMetadata(key, originalMethod);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
      Reflect.defineMetadata(key, value, descriptor.value);
    }
  }
}
