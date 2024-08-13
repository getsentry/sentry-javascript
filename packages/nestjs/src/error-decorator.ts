import { captureException } from '@sentry/core';

/**
 * A decorator usable to wrap user-defined exception filters to add sentry error reporting.
 */
export function SentryCaptureException() {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    descriptor.value = new Proxy(descriptor.value, {
      apply: (originalCatch, thisArgCatch, argsCatch) => {
        const exception = argsCatch[0];
        const exceptionIsObject = typeof exception === 'object' && exception !== null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const exceptionStatusCode = exceptionIsObject && 'status' in exception ? exception.status : null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const exceptionErrorProperty = exceptionIsObject && 'error' in exception ? exception.error : null;

        /*
        Don't report expected NestJS control flow errors
        - `HttpException` errors will have a `status` property
        - `RpcException` errors will have an `error` property
         */
        if (exceptionStatusCode !== null || exceptionErrorProperty !== null) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return originalCatch.apply(thisArgCatch, argsCatch);
        }

        captureException(exception);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalCatch.apply(thisArgCatch, argsCatch);
      },
    });
  };
}
