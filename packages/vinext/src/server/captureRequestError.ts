import type { RequestEventData } from '@sentry/core';
import { captureException, flush, headersToDict, vercelWaitUntil, withScope } from '@sentry/core';
import type { ErrorContext, RequestInfo } from '../common/types';

/**
 * Reports errors passed to vinext's `onRequestError` instrumentation hook.
 *
 * Usage in `instrumentation.ts`:
 * ```ts
 * import * as Sentry from '@sentry/vinext';
 * export const onRequestError = Sentry.captureRequestError;
 * ```
 */
export function captureRequestError(error: unknown, request: RequestInfo, errorContext: ErrorContext): void {
  withScope(scope => {
    scope.setSDKProcessingMetadata({
      normalizedRequest: {
        headers: headersToDict(request.headers),
        method: request.method,
      } satisfies RequestEventData,
    });

    scope.setContext('vinext', {
      request_path: request.path,
      router_kind: errorContext.routerKind,
      router_path: errorContext.routePath,
      route_type: errorContext.routeType,
    });

    scope.setTransactionName(`${request.method} ${errorContext.routePath}`);

    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.function.vinext.on_request_error',
      },
    });

    vercelWaitUntil(flushSafelyWithTimeout());
  });
}

async function flushSafelyWithTimeout(): Promise<void> {
  try {
    await flush(2000);
  } catch {
    // noop
  }
}
