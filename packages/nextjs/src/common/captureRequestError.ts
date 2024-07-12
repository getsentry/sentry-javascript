import { captureException, withScope } from '@sentry/core';

type RequestInfo = {
  url: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routerKind: string; // 'Pages Router' | 'App Router'
  routePath: string;
  routeType: string; // 'render' | 'route' | 'middleware'
};

/**
 * Reports errors for the Next.js `onRequestError` instrumentation hook.
 *
 * Notice: This function is experimental and not intended for production use. Breaking changes may be done to this funtion in any release.
 */
export function experimental_captureRequestError(
  error: unknown,
  request: RequestInfo,
  errorContext: ErrorContext,
): void {
  withScope(scope => {
    scope.setSDKProcessingMetadata({
      request: {
        headers: request.headers,
        method: request.method,
      },
    });

    scope.setContext('nextjs', {
      request_path: request.url,
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
