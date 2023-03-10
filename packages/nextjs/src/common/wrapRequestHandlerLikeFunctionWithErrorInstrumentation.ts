import { captureException, getCurrentHub } from '@sentry/core';
import { addExceptionMechanism, isThenable } from '@sentry/utils';

interface ErrorInfo {
  wrappingTargetName: string;
}

interface ErrorInfoCreator<Args extends any[]> {
  (functionArgs: Args): ErrorInfo;
}

interface BeforeCaptureErrorHookResult {
  skipCapturingError?: boolean;
}

interface BeforeCaptureErrorHook<Args extends any[]> {
  (functionArgs: Args, error: unknown): PromiseLike<BeforeCaptureErrorHookResult>;
}

const defaultBeforeCaptureError = async (): Promise<BeforeCaptureErrorHookResult> => {
  return {
    skipCapturingError: false,
  };
};

/**
 * Generic function that wraps any other function with Sentry error instrumentation.
 */
export function wrapRequestHandlerLikeFunctionWithErrorInstrumentation<A extends any[], F extends (...args: A) => any>(
  originalFunction: F,
  errorInfoCreator: ErrorInfoCreator<A>,
  beforeCaptureError: BeforeCaptureErrorHook<A> = defaultBeforeCaptureError,
): (...args: Parameters<F>) => ReturnType<F> {
  return new Proxy(originalFunction, {
    apply: (originalFunction, thisArg: unknown, args: Parameters<F>): ReturnType<F> => {
      const errorInfo = errorInfoCreator(args);

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

      const reportError = (error: unknown): void => {
        void beforeCaptureError(args, error).then(beforeCaptureErrorResult => {
          if (!beforeCaptureErrorResult.skipCapturingError) {
            captureException(error);
          }
        });
      };

      let maybePromiseResult: ReturnType<F>;
      try {
        maybePromiseResult = originalFunction.apply(thisArg, args);
      } catch (err) {
        reportError(err);
        throw err;
      }

      if (isThenable(maybePromiseResult)) {
        const promiseResult = maybePromiseResult.then(null, (err: unknown) => {
          reportError(err);
          throw err;
        });

        return promiseResult;
      } else {
        return maybePromiseResult;
      }
    },
  });
}
