import * as Sentry from '@sentry/nextjs';
// @ts-expect-error Because we cannot be sure if the RequestAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
import { requestAsyncStorage } from '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__';
// @ts-expect-error Because we cannot be sure if the staticGenerationAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
import { staticGenerationAsyncStorage } from '__SENTRY_NEXTJS_STATIC_GENERATION_ASYNC_STORAGE_SHIM__';
// @ts-expect-error See above
import * as routeModule from '__SENTRY_WRAPPING_TARGET_FILE__';
import type { StaticGenerationStore } from '../../common/types';

import type { RequestAsyncStorage } from './requestAsyncStorageShim';
import type { StaticGenerationAsyncStorage } from './staticGenerationAsyncStorageShim';

declare const requestAsyncStorage: RequestAsyncStorage;
declare const staticGenerationAsyncStorage: StaticGenerationAsyncStorage;

declare const routeModule: {
  GET?: (...args: unknown[]) => unknown;
  POST?: (...args: unknown[]) => unknown;
  PUT?: (...args: unknown[]) => unknown;
  PATCH?: (...args: unknown[]) => unknown;
  DELETE?: (...args: unknown[]) => unknown;
  HEAD?: (...args: unknown[]) => unknown;
  OPTIONS?: (...args: unknown[]) => unknown;
};

function storeHasStaticBehaviour(staticGenerationStore: StaticGenerationStore): boolean {
  return !!(
    staticGenerationStore?.forceStatic ||
    staticGenerationStore?.isStaticGeneration ||
    staticGenerationStore?.dynamicShouldError ||
    staticGenerationStore?.experimental?.ppr ||
    staticGenerationStore?.ppr
  );
}

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

      let hasStaticBehaviour: boolean | undefined = false;
      try {
        const staticGenerationStore = staticGenerationAsyncStorage.getStore();
        if (staticGenerationStore) {
          hasStaticBehaviour = storeHasStaticBehaviour(staticGenerationStore);
        }
      } catch (e) {
        /** empty */
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      return Sentry.wrapRouteHandlerWithSentry(originalFunction as any, {
        method,
        parameterizedRoute: '__ROUTE__',
        sentryTraceHeader,
        baggageHeader,
        hasStaticBehaviour,
      }).apply(thisArg, args);
    },
  });
}

// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

// @ts-expect-error This is the file we're wrapping
export { default } from '__SENTRY_WRAPPING_TARGET_FILE__';

export const GET = wrapHandler(routeModule.GET, 'GET');
export const POST = wrapHandler(routeModule.POST, 'POST');
export const PUT = wrapHandler(routeModule.PUT, 'PUT');
export const PATCH = wrapHandler(routeModule.PATCH, 'PATCH');
export const DELETE = wrapHandler(routeModule.DELETE, 'DELETE');
export const HEAD = wrapHandler(routeModule.HEAD, 'HEAD');
export const OPTIONS = wrapHandler(routeModule.OPTIONS, 'OPTIONS');
