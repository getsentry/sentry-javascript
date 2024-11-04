import * as Sentry from '@sentry/nextjs';
import type { WebFetchHeaders } from '@sentry/types';
// @ts-expect-error Because we cannot be sure if the RequestAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
import * as origModule from '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__';
// @ts-expect-error See above
import * as routeModule from '__SENTRY_WRAPPING_TARGET_FILE__';

import type { RequestAsyncStorage } from './requestAsyncStorageShim';

type NextAsyncStorageModule =
  | {
      workUnitAsyncStorage: RequestAsyncStorage;
    }
  | {
      requestAsyncStorage: RequestAsyncStorage;
    };

const asyncStorageModule = { ...origModule } as NextAsyncStorageModule;

const requestAsyncStorage: RequestAsyncStorage | undefined =
  'workUnitAsyncStorage' in asyncStorageModule
    ? asyncStorageModule.workUnitAsyncStorage
    : 'requestAsyncStorage' in asyncStorageModule
      ? asyncStorageModule.requestAsyncStorage
      : undefined;

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
      let headers: WebFetchHeaders | undefined = undefined;

      // We try-catch here just in case the API around `requestAsyncStorage` changes unexpectedly since it is not public API
      try {
        const requestAsyncStore = requestAsyncStorage?.getStore() as ReturnType<RequestAsyncStorage['getStore']>;
        headers = requestAsyncStore?.headers;
      } catch (e) {
        /** empty */
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Sentry.wrapRouteHandlerWithSentry(originalFunction as any, {
        method,
        parameterizedRoute: '__ROUTE__',
        headers,
      }).apply(thisArg, args);
    },
  });
}

// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-expect-error This is the file we're wrapping
export { default } from '__SENTRY_WRAPPING_TARGET_FILE__';

type RouteHandler = (...args: unknown[]) => unknown;

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const GET = wrapHandler(routeModule.GET as RouteHandler, 'GET');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const POST = wrapHandler(routeModule.POST as RouteHandler, 'POST');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const PUT = wrapHandler(routeModule.PUT as RouteHandler, 'PUT');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const PATCH = wrapHandler(routeModule.PATCH as RouteHandler, 'PATCH');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const DELETE = wrapHandler(routeModule.DELETE as RouteHandler, 'DELETE');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const HEAD = wrapHandler(routeModule.HEAD as RouteHandler, 'HEAD');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const OPTIONS = wrapHandler(routeModule.OPTIONS as RouteHandler, 'OPTIONS');
