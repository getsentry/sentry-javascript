import { captureException } from '@sentry/core';
import { isThenable } from '@sentry/utils';

interface WrappingParams {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
}

/**
 * TODO
 */
export function wrapRouteHandlerWithSentry<H extends (...args: unknown[]) => unknown>(
  originalRouteHandler: H,
  wrappingParams: WrappingParams,
): H {
  return new Proxy(originalRouteHandler, {
    apply: (wrappingTarget, thisArg: unknown, args: unknown[]) => {
      const handleError = (e: unknown): never => {
        captureException(e);
        throw e;
      };

      let maybePromiseResult: unknown;
      try {
        maybePromiseResult = wrappingTarget.apply(thisArg, args);
      } catch (e) {
        handleError(e);
      }

      if (isThenable(maybePromiseResult)) {
        return maybePromiseResult.then(null, (err: unknown) => {
          handleError(err);
        });
      } else {
        return maybePromiseResult;
      }
    },
  });
}
