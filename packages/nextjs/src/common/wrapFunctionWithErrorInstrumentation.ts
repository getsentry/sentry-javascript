import { captureException, getCurrentHub } from '@sentry/core';
import { addExceptionMechanism, isThenable } from '@sentry/utils';

interface ErrorInfo {
  wrappingTargetName: string;
}

interface ErrorInfoCreator<Args extends any[]> {
  (functionArgs: Args): ErrorInfo;
}

/**
 * TODO
 */
export function wrapRequestHandlerLikeFunctionWithErrorInstrumentation<A extends any[], F extends (...args: A) => any>(
  originalFunction: F,
  errorInfoCreator: ErrorInfoCreator<A>,
): (...args: Parameters<F>) => ReturnType<F> {
  return new Proxy(originalFunction, {
    apply: (originalFunction, thisArg: unknown, args: Parameters<F>): ReturnType<F> => {
      const errorInfo: ErrorInfo = errorInfoCreator(args);

      const scope = getCurrentHub().getScope();
      if (scope) {
        scope.addEventProcessor(event => {
          addExceptionMechanism(event, {
            type: 'instrument',
            handled: false,
            data: {
              wrapped_function: errorInfo.wrappingTargetName,
            },
          });
          return event;
        });
      }

      const handleError = (error: unknown): void => {
        captureException(error);
      };

      let maybePromiseResult: ReturnType<F>;
      try {
        maybePromiseResult = originalFunction.apply(thisArg, args);
      } catch (err) {
        handleError(err);
        throw err;
      }

      if (isThenable(maybePromiseResult)) {
        const promiseResult = maybePromiseResult.then(null, (err: unknown) => {
          handleError(err);
          throw err;
        });

        return promiseResult;
      } else {
        return maybePromiseResult;
      }
    },
  });
}
