import { addTracingHeadersToFetchRequest } from '@sentry-internal/tracing';
import type { BaseClient } from '@sentry/core';
import { getCurrentHub, trace } from '@sentry/core';
import type { Breadcrumbs, BrowserTracing } from '@sentry/svelte';
import { captureException } from '@sentry/svelte';
import type { ClientOptions, SanitizedRequestData } from '@sentry/types';
import {
  addExceptionMechanism,
  addNonEnumerableProperty,
  getSanitizedUrlString,
  objectify,
  parseFetchArgs,
  parseUrl,
  stringMatchesSomePattern,
} from '@sentry/utils';
import type { LoadEvent } from '@sveltejs/kit';

import type { SentryWrappedFlag } from '../common/utils';
import { isRedirect } from '../common/utils';

type PatchedLoadEvent = LoadEvent & Partial<SentryWrappedFlag>;

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // We don't want to capture thrown `Redirect`s as these are not errors but expected behaviour
  if (isRedirect(objectifiedErr)) {
    return objectifiedErr;
  }

  captureException(objectifiedErr, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'sveltekit',
        handled: false,
        data: {
          function: 'load',
        },
      });
      return event;
    });

    return scope;
  });

  return objectifiedErr;
}

/**
 * Wrap load function with Sentry. This wrapper will
 *
 * - catch errors happening during the execution of `load`
 * - create a load span if performance monitoring is enabled
 * - attach tracing Http headers to `fech` requests if performance monitoring is enabled to get connected traces.
 * - add a fetch breadcrumb for every `fetch` request
 *
 * Note that tracing Http headers are only attached if the url matches the specified `tracePropagationTargets`
 * entries to avoid CORS errors.
 *
 * @param origLoad SvelteKit user defined load function
 */
// The liberal generic typing of `T` is necessary because we cannot let T extend `Load`.
// This function needs to tell TS that it returns exactly the type that it was called with
// because SvelteKit generates the narrowed down `PageLoad` or `LayoutLoad` types
// at build time for every route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapLoadWithSentry<T extends (...args: any) => any>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `Load` (see comment above function signature)
      const event = args[0] as PatchedLoadEvent;

      // Check if already wrapped
      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      const patchedEvent: PatchedLoadEvent = {
        ...event,
        fetch: instrumentSvelteKitFetch(event.fetch),
      };

      addNonEnumerableProperty(patchedEvent as unknown as Record<string, unknown>, '__sentry_wrapped__', true);

      const routeId = event.route.id;
      return trace(
        {
          op: 'function.sveltekit.load',
          name: routeId ? routeId : event.url.pathname,
          status: 'ok',
          metadata: {
            source: routeId ? 'route' : 'url',
          },
        },
        () => wrappingTarget.apply(thisArg, [patchedEvent]),
        sendErrorToSentry,
      );
    },
  });
}

type SvelteKitFetch = LoadEvent['fetch'];

/**
 * Instruments SvelteKit's client `fetch` implementation which is passed to the client-side universal `load` functions.
 *
 * We need to instrument this in addition to the native fetch we instrument in BrowserTracing because SvelteKit
 * stores the native fetch implementation before our SDK is initialized.
 *
 * see: https://github.com/sveltejs/kit/blob/master/packages/kit/src/runtime/client/fetcher.js
 *
 * This instrumentation takes the fetch-related options from `BrowserTracing` to determine if we should
 * instrument fetch for perfomance monitoring, create a span for or attach our tracing headers to the given request.
 *
 * To dertermine if breadcrumbs should be recorded, this instrumentation relies on the availability of and the options
 * set in the `BreadCrumbs` integration.
 *
 * @param originalFetch SvelteKit's original fetch implemenetation
 *
 * @returns a proxy of SvelteKit's fetch implementation
 */
function instrumentSvelteKitFetch(originalFetch: SvelteKitFetch): SvelteKitFetch {
  const client = getCurrentHub().getClient() as BaseClient<ClientOptions>;

  const browserTracingIntegration =
    client.getIntegrationById && (client.getIntegrationById('BrowserTracing') as BrowserTracing | undefined);
  const breadcrumbsIntegration =
    client.getIntegrationById && (client.getIntegrationById('Breadcrumbs') as Breadcrumbs | undefined);

  const browserTracingOptions = browserTracingIntegration && browserTracingIntegration.options;

  const shouldTraceFetch = browserTracingOptions && browserTracingOptions.traceFetch;
  const shouldAddFetchBreadcrumb = breadcrumbsIntegration && breadcrumbsIntegration.options.fetch;

  /* Identical check as in BrowserTracing, just that we also need to verify that BrowserTracing is actually installed */
  const shouldCreateSpan =
    browserTracingOptions && typeof browserTracingOptions.shouldCreateSpanForRequest === 'function'
      ? browserTracingOptions.shouldCreateSpanForRequest
      : (_: string) => shouldTraceFetch;

  /* Identical check as in BrowserTracing, just that we also need to verify that BrowserTracing is actually installed */
  const shouldAttachHeaders: (url: string) => boolean = url => {
    return (
      !!shouldTraceFetch &&
      stringMatchesSomePattern(url, browserTracingOptions.tracePropagationTargets || ['localhost', /^\//])
    );
  };

  return new Proxy(originalFetch, {
    apply: (wrappingTarget, thisArg, args: Parameters<LoadEvent['fetch']>) => {
      const [input, init] = args;
      const { url: rawUrl, method } = parseFetchArgs(args);

      // TODO: extract this to a util function (and use it in breadcrumbs integration as well)
      if (rawUrl.match(/sentry_key/)) {
        // We don't create spans or breadcrumbs for fetch requests that contain `sentry_key` (internal sentry requests)
        return wrappingTarget.apply(thisArg, args);
      }

      const urlObject = parseUrl(rawUrl);

      const requestData: SanitizedRequestData = {
        url: getSanitizedUrlString(urlObject),
        'http.method': method,
        ...(urlObject.search && { 'http.query': urlObject.search.substring(1) }),
        ...(urlObject.hash && { 'http.hash': urlObject.hash.substring(1) }),
      };

      const patchedInit: RequestInit = { ...init };
      const activeSpan = getCurrentHub().getScope().getSpan();
      const activeTransaction = activeSpan && activeSpan.transaction;

      const createSpan = activeTransaction && shouldCreateSpan(rawUrl);
      const attachHeaders = createSpan && activeTransaction && shouldAttachHeaders(rawUrl);

      // only attach headers if we should create a span
      if (attachHeaders) {
        const dsc = activeTransaction.getDynamicSamplingContext();

        const headers = addTracingHeadersToFetchRequest(
          input as string | Request,
          dsc,
          activeSpan,
          patchedInit as {
            headers:
              | {
                  [key: string]: string[] | string | undefined;
                }
              | Request['headers'];
          },
        ) as HeadersInit;

        patchedInit.headers = headers;
      }
      let fetchPromise: Promise<Response>;

      const patchedFetchArgs = [input, patchedInit];

      if (createSpan) {
        fetchPromise = trace(
          {
            name: `${method} ${requestData.url}`, // this will become the description of the span
            op: 'http.client',
            data: requestData,
          },
          span => {
            const promise: Promise<Response> = wrappingTarget.apply(thisArg, patchedFetchArgs);
            if (span) {
              promise.then(res => span.setHttpStatus(res.status)).catch(_ => span.setStatus('internal_error'));
            }
            return promise;
          },
        );
      } else {
        fetchPromise = wrappingTarget.apply(thisArg, patchedFetchArgs);
      }

      if (shouldAddFetchBreadcrumb) {
        addFetchBreadcrumb(fetchPromise, requestData, args);
      }

      return fetchPromise;
    },
  });
}

/* Adds a breadcrumb for the given fetch result */
function addFetchBreadcrumb(
  fetchResult: Promise<Response>,
  requestData: SanitizedRequestData,
  args: Parameters<SvelteKitFetch>,
): void {
  const breadcrumbStartTimestamp = Date.now();
  fetchResult.then(
    response => {
      getCurrentHub().addBreadcrumb(
        {
          type: 'http',
          category: 'fetch',
          data: {
            ...requestData,
            status_code: response.status,
          },
        },
        {
          input: args,
          response,
          startTimestamp: breadcrumbStartTimestamp,
          endTimestamp: Date.now(),
        },
      );
    },
    error => {
      getCurrentHub().addBreadcrumb(
        {
          type: 'http',
          category: 'fetch',
          level: 'error',
          data: requestData,
        },
        {
          input: args,
          data: error,
          startTimestamp: breadcrumbStartTimestamp,
          endTimestamp: Date.now(),
        },
      );
    },
  );
}
