import { captureException, getIsolationScope, httpRequestToRequestData } from '@sentry/core';
import { isExpressErrorHandled } from './error-handled';
import type { ExpressRequest, ExpressResponse, MiddlewareError } from './types';
import { defaultShouldHandleError } from './utils';

type ExpressErrorMiddleware = (
  error: MiddlewareError,
  request: ExpressRequest,
  res: ExpressResponse,
  next: (error: MiddlewareError) => void,
) => void;

type ExpressMiddleware = (request: ExpressRequest, res: ExpressResponse, next: () => void) => void;

/**
 * Set request data on the isolation scope so a captured error carries request context. Mirrors the
 * request handler middleware, which does not run once an error short-circuits the middleware chain.
 */
function setSDKProcessingMetadata(request: ExpressRequest): void {
  const sdkProcMeta = getIsolationScope()?.getScopeData()?.sdkProcessingMetadata;
  if (!sdkProcMeta?.normalizedRequest) {
    const normalizedRequest = httpRequestToRequestData(request);
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });
  }
}

/**
 * An Express-compatible error handler, used by {@link setupExpressErrorHandler}.
 *
 * @deprecated `expressIntegration()` now captures errors automatically. This export is deprecated and
 * will be removed in the next major version. Migrate to the `expressIntegration` to filter with `shouldHandleError`.
 */
export function expressErrorHandler(): ExpressErrorMiddleware {
  return function sentryErrorMiddleware(error, request, res, next): void {
    // When an error happens, the request handler middleware does not run, so we set it here too.
    setSDKProcessingMetadata(request);

    // The channel-based `expressIntegration()` captures at the throw site, before this middleware runs,
    // and marks the request when it does. If it already handled this request's error (captured it, or
    // deliberately skipped it per its own `shouldHandleError`), defer to that decision: the integration
    // is the single registered handler and its `shouldHandleError` wins, so we never double-capture or
    // override it here.
    if (isExpressErrorHandled(request)) {
      next(error);
      return;
    }

    // `shouldHandleError` is an `expressIntegration()` feature and is deliberately not honoured here:
    // this path exists to keep capturing errors, not to filter them.
    if (defaultShouldHandleError(error)) {
      const eventId = captureException(error, {
        mechanism: { type: 'auto.middleware.express', handled: false },
      });
      (res as { sentry?: string }).sentry = eventId;
    }

    next(error);
  };
}

function expressRequestHandler(): ExpressMiddleware {
  return function sentryRequestMiddleware(request, _res, next): void {
    setSDKProcessingMetadata(request);
    next();
  };
}

/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instance
 *
 * @deprecated `expressIntegration()` now captures errors automatically, so calling this error handler is no longer
 * necessary. To customize which errors are captured, pass `shouldHandleError` to `expressIntegration()`.
 * This export is deprecated and will be removed in the next major version.
 */
export function setupExpressErrorHandler(app: {
  // oxlint-disable-next-line no-explicit-any
  use: (middleware: any) => unknown;
}): void {
  app.use(expressRequestHandler());
  // oxlint-disable-next-line typescript/no-deprecated
  app.use(expressErrorHandler());
}
