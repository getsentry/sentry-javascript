import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, startSpan } from '@sentry/node';

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
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          },
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
