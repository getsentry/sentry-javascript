import { HttpException } from '@nestjs/common';
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
        const exceptionErrorProperty = exceptionIsObject && 'error' in exception ? exception.error : null;

        /*
        Don't report expected NestJS control flow errors
        - `HttpException`
        - `RpcException` errors will have an `error` property and we cannot rely directly on the `RpcException` class
          because it is part of `@nestjs/microservices`, which is not a dependency for all nest applications
         */
        if (exception instanceof HttpException || exceptionErrorProperty !== null) {
          return originalCatch.apply(thisArgCatch, argsCatch);
        }

        captureException(exception);
        return originalCatch.apply(thisArgCatch, argsCatch);
      },
    });
  };
}
