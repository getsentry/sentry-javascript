// @ts-ignore Because we cannot be sure if the RequestAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
// eslint-disable-next-line import/no-unresolved
import { requestAsyncStorage } from '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__';
// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
import * as routeModule from '__SENTRY_WRAPPING_TARGET_FILE__';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as Sentry from '@sentry/nextjs';

import type { RequestAsyncStorage } from './requestAsyncStorageShim';

declare const requestAsyncStorage: RequestAsyncStorage;

declare const routeModule: {
  GET?: (...args: unknown[]) => unknown;
  POST?: (...args: unknown[]) => unknown;
  PUT?: (...args: unknown[]) => unknown;
  PATCH?: (...args: unknown[]) => unknown;
  DELETE?: (...args: unknown[]) => unknown;
  HEAD?: (...args: unknown[]) => unknown;
  OPTIONS?: (...args: unknown[]) => unknown;
};

function wrapHandler<T>(handler: T, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'): T {
  // Running the instrumentation code during the build phase will mark any function as "dynamic" because we're accessing
  // the Request object. We do not want to turn handlers dynamic so we skip instrumentation in the build phase.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return handler;
  }

  if (typeof handler !== 'function') {
    return handler;
  }

  return new Proxy(handler, {
    apply: (originalFunction, thisArg, args) => {
      let sentryTraceHeader: string | undefined | null = undefined;
      let baggageHeader: string | undefined | null = undefined;

      // We try-catch here just in case the API around `requestAsyncStorage` changes unexpectedly since it is not public API
      try {
        const requestAsyncStore = requestAsyncStorage.getStore();
        sentryTraceHeader = requestAsyncStore?.headers.get('sentry-trace') ?? undefined;
        baggageHeader = requestAsyncStore?.headers.get('baggage') ?? undefined;
      } catch (e) {
        /** empty */
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      return Sentry.wrapRouteHandlerWithSentry(originalFunction as any, {
        method,
        parameterizedRoute: '__ROUTE__',
        sentryTraceHeader,
        baggageHeader,
      }).apply(thisArg, args);
    },
  });
}

// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-ignore This is the file we're wrapping
// eslint-disable-next-line import/no-unresolved
export { default } from '__SENTRY_WRAPPING_TARGET_FILE__';

export const GET = wrapHandler(routeModule.GET, 'GET');
export const POST = wrapHandler(routeModule.POST, 'POST');
export const PUT = wrapHandler(routeModule.PUT, 'PUT');
export const PATCH = wrapHandler(routeModule.PATCH, 'PATCH');
export const DELETE = wrapHandler(routeModule.DELETE, 'DELETE');
export const HEAD = wrapHandler(routeModule.HEAD, 'HEAD');
export const OPTIONS = wrapHandler(routeModule.OPTIONS, 'OPTIONS');
