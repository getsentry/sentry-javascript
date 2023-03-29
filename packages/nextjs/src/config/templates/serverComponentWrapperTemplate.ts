// @ts-ignore Because we cannot be sure if the RequestAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
// eslint-disable-next-line import/no-unresolved
import { requestAsyncStorage } from '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__';
// @ts-ignore We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped.
// eslint-disable-next-line import/no-unresolved
import * as serverComponentModule from '__SENTRY_WRAPPING_TARGET_FILE__';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as Sentry from '@sentry/nextjs';

import type { RequestAsyncStorage } from './requestAsyncStorageShim';

declare const requestAsyncStorage: RequestAsyncStorage;

declare const serverComponentModule: {
  default: unknown;
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

      // We try-catch here just in case the API around `requestAsyncStorage` changes unexpectedly since it is not public API
      try {
        const requestAsyncStore = requestAsyncStorage.getStore();
        sentryTraceHeader = requestAsyncStore?.headers.get('sentry-trace');
        baggageHeader = requestAsyncStore?.headers.get('baggage');
      } catch (e) {
        /** empty */
      }

      return Sentry.wrapServerComponentWithSentry(originalFunction, {
        componentRoute: '__ROUTE__',
        componentType: '__COMPONENT_TYPE__',
        sentryTraceHeader,
        baggageHeader,
      }).apply(thisArg, args);
    },
  });
} else {
  wrappedServerComponent = serverComponent;
}

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-ignore See above
// eslint-disable-next-line import/no-unresolved
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

export default wrappedServerComponent;
