import { captureException, startSpan } from '@sentry/node';

/**
 * A decorator usable to wrap arbitrary functions with spans.
 */
export function SentryTraced(op: string = 'function') {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalMethod = descriptor.value as (...args: any[]) => Promise<any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = async function (...args: any[]) {
      await startSpan(
        {
          op: op,
          name: propertyKey,
        },
        async () => {
          try {
            return await originalMethod.apply(this, args);
          } catch (e) {
            captureException(e);
          }
        },
      );
    };
    return descriptor;
  };
}
