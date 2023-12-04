import * as Sentry from '@sentry/nextjs';
import type { WebFetchHeaders } from '@sentry/types';
// @ts-expect-error Because we cannot be sure if the RequestAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
import { requestAsyncStorage } from '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__';
// @ts-expect-error We use `__SENTRY_WRAPPING_TARGET_FILE__` as a placeholder for the path to the file being wrapped.
import * as serverComponentModule from '__SENTRY_WRAPPING_TARGET_FILE__';

import type { RequestAsyncStorage } from './requestAsyncStorageShim';

// @ts-expect-error Because we cannot be sure if the staticGenerationAsyncStorage module exists (it is not part of the Next.js public
// API) we use a shim if it doesn't exist. The logic for this is in the wrapping loader.
import { staticGenerationAsyncStorage } from '__SENTRY_NEXTJS_STATIC_GENERATION_ASYNC_STORAGE_SHIM__';

import { storeHasStaticBehaviour } from '../../common/utils/hasStaticBehaviour';
import type { StaticGenerationAsyncStorage } from './staticGenerationAsyncStorageShim';

declare const staticGenerationAsyncStorage: StaticGenerationAsyncStorage;

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
      let headers: WebFetchHeaders | undefined = undefined;

      // We try-catch here just in `requestAsyncStorage` is undefined since it may not be defined
      try {
        const requestAsyncStore = requestAsyncStorage.getStore();
        sentryTraceHeader = requestAsyncStore?.headers.get('sentry-trace');
        baggageHeader = requestAsyncStore?.headers.get('baggage');
        headers = requestAsyncStore?.headers;
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

      return Sentry.wrapServerComponentWithSentry(originalFunction, {
        componentRoute: '__ROUTE__',
        componentType: '__COMPONENT_TYPE__',
        sentryTraceHeader,
        baggageHeader,
        headers,
        hasStaticBehaviour,
      }).apply(thisArg, args);
    },
  });
} else {
  wrappedServerComponent = serverComponent;
}

// Re-export anything exported by the page module we're wrapping. When processing this code, Rollup is smart enough to
// not include anything whose name matchs something we've explicitly exported above.
// @ts-expect-error See above
export * from '__SENTRY_WRAPPING_TARGET_FILE__';

export default wrappedServerComponent;
