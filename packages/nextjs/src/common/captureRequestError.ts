import { captureException, withScope } from '@sentry/core';
import { headersToDict } from '@sentry/core';
import type { RequestEventData } from '@sentry/core';

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routerKind: string; // 'Pages Router' | 'App Router'
  routePath: string;
  routeType: string; // 'render' | 'route' | 'middleware'
};

/**
 * Reports errors passed to the the Next.js `onRequestError` instrumentation hook.
 */
export function captureRequestError(error: unknown, request: RequestInfo, errorContext: ErrorContext): void {
  withScope(scope => {
    scope.setSDKProcessingMetadata({
      normalizedRequest: {
        headers: headersToDict(request.headers),
        method: request.method,
      } satisfies RequestEventData,
    });

    scope.setContext('nextjs', {
      request_path: request.path,
      router_kind: errorContext.routerKind,
      router_path: errorContext.routePath,
      route_type: errorContext.routeType,
    });

    scope.setTransactionName(errorContext.routePath);

    captureException(error, {
      mechanism: {
        handled: false,
      },
    });
  });
}

/**
 * Reports errors passed to the the Next.js `onRequestError` instrumentation hook.
 *
 * @deprecated Use `captureRequestError` instead.
 */
// TODO(v9): Remove this export
export const experimental_captureRequestError = captureRequestError;
