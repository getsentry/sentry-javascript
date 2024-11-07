import * as Sentry from '@sentry/nextjs';
import type { WebFetchHeaders } from '@sentry/types';
// @ts-expect-error Because we cannot be sure if the RequestAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
import * as origModule from '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__';
// @ts-expect-error We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped.
// biome-ignore lint/nursery/noUnusedImports: Biome doesn't understand the shim with variable import path
import * as serverComponentModule from '__SENTRY_WRAPPING_TARGET_FILE__';

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

declare const serverComponentModule: {
  default: unknown;
  generateMetadata?: () => unknown;
  generateImageMetadata?: () => unknown;
  generateViewport?: () => unknown;
};

const serverComponent = serverComponentModule.default;

let wrappedServerComponent;
if (typeof serverComponent === 'function') {
  // For some odd Next.js magic reason, `headers()` will not work if used inside `wrapServerComponentsWithSentry`.
  // Current assumption is that Next.js applies some loader magic to userfiles, but not files in node_modules. This file
  // is technically a userfile so it gets the loader magic applied.
  wrappedServerComponent = new Proxy(serverComponent, {
    apply: (originalFunction, thisArg, args) => {
      let sentryTraceHeader: string | undefined | null = undefined;
      let baggageHeader: string | undefined | null = undefined;
      let headers: WebFetchHeaders | undefined = undefined;

      // We try-catch here just in `requestAsyncStorage` is undefined since it may not be defined
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const requestAsyncStore = requestAsyncStorage?.getStore() as ReturnType<RequestAsyncStorage['getStore']>;
        sentryTraceHeader = requestAsyncStore?.headers.get('sentry-trace') ?? undefined;
        baggageHeader = requestAsyncStore?.headers.get('baggage') ?? undefined;
        headers = requestAsyncStore?.headers;
      } catch (e) {
        /** empty */
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      return Sentry.wrapServerComponentWithSentry(originalFunction as any, {
        componentRoute: '__ROUTE__',
        componentType: '__COMPONENT_TYPE__',
        sentryTraceHeader,
        baggageHeader,
        headers,
      }).apply(thisArg, args);
    },
  });
} else {
  wrappedServerComponent = serverComponent;
}

export const generateMetadata = serverComponentModule.generateMetadata
  ? Sentry.wrapGenerationFunctionWithSentry(serverComponentModule.generateMetadata, {
      componentRoute: '__ROUTE__',
      componentType: '__COMPONENT_TYPE__',
      generationFunctionIdentifier: 'generateMetadata',
      requestAsyncStorage,
    })
  : undefined;

export const generateImageMetadata = serverComponentModule.generateImageMetadata
  ? Sentry.wrapGenerationFunctionWithSentry(serverComponentModule.generateImageMetadata, {
      componentRoute: '__ROUTE__',
      componentType: '__COMPONENT_TYPE__',
      generationFunctionIdentifier: 'generateImageMetadata',
      requestAsyncStorage,
    })
  : undefined;

export const generateViewport = serverComponentModule.generateViewport
  ? Sentry.wrapGenerationFunctionWithSentry(serverComponentModule.generateViewport, {
      componentRoute: '__ROUTE__',
      componentType: '__COMPONENT_TYPE__',
      generationFunctionIdentifier: 'generateViewport',
      requestAsyncStorage,
    })
  : undefined;

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matches something we've explicitly exported above.
// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

export default wrappedServerComponent;
