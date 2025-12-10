/* eslint-disable @typescript-eslint/no-explicit-any */
import { getClient } from '../currentScopes';
import type { HandlerDataFetch } from '../types-hoist/instrument';
import type { WebFetchHeaders } from '../types-hoist/webfetchapi';
import { isError, isRequest } from '../utils/is';
import { addNonEnumerableProperty, fill } from '../utils/object';
import { supportsNativeFetch } from '../utils/supports';
import { timestampInSeconds } from '../utils/time';
import { GLOBAL_OBJ } from '../utils/worldwide';
import { addHandler, maybeInstrument, triggerHandlers } from './handlers';

type FetchResource = string | { toString(): string } | { url: string };

/**
 * Add an instrumentation handler for when a fetch request happens.
 * The handler function is called once when the request starts and once when it ends,
 * which can be identified by checking if it has an `endTimestamp`.
 *
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addFetchInstrumentationHandler(
  handler: (data: HandlerDataFetch) => void,
  skipNativeFetchCheck?: boolean,
): void {
  const type = 'fetch';
  addHandler(type, handler);
  maybeInstrument(type, () => instrumentFetch(undefined, skipNativeFetchCheck));
}

/**
 * Add an instrumentation handler for long-lived fetch requests, like consuming server-sent events (SSE) via fetch.
 * The handler will resolve the request body and emit the actual `endTimestamp`, so that the
 * span can be updated accordingly.
 *
 * Only used internally
 * @hidden
 */
export function addFetchEndInstrumentationHandler(handler: (data: HandlerDataFetch) => void): void {
  const type = 'fetch-body-resolved';
  addHandler(type, handler);
  maybeInstrument(type, () => instrumentFetch(streamHandler));
}

function instrumentFetch(onFetchResolved?: (response: Response) => void, skipNativeFetchCheck: boolean = false): void {
  if (skipNativeFetchCheck && !supportsNativeFetch()) {
    return;
  }

  fill(GLOBAL_OBJ, 'fetch', function (originalFetch: () => void): () => void {
    return function (...args: any[]): void {
      // We capture the error right here and not in the Promise error callback because Safari (and probably other
      // browsers too) will wipe the stack trace up to this point, only leaving us with this file which is useless.

      // NOTE: If you are a Sentry user, and you are seeing this stack frame,
      //       it means the error, that was caused by your fetch call did not
      //       have a stack trace, so the SDK backfilled the stack trace so
      //       you can see which fetch call failed.
      const virtualError = new Error();

      const { method, url } = parseFetchArgs(args);
      const handlerData: HandlerDataFetch = {
        args,
        fetchData: {
          method,
          url,
        },
        startTimestamp: timestampInSeconds() * 1000,
        // // Adding the error to be able to fingerprint the failed fetch event in HttpClient instrumentation
        virtualError,
        headers: getHeadersFromFetchArgs(args),
      };

      // if there is no callback, fetch is instrumented directly
      if (!onFetchResolved) {
        triggerHandlers('fetch', {
          ...handlerData,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalFetch.apply(GLOBAL_OBJ, args).then(
        async (response: Response) => {
          if (onFetchResolved) {
            onFetchResolved(response);
          } else {
            triggerHandlers('fetch', {
              ...handlerData,
              endTimestamp: timestampInSeconds() * 1000,
              response,
            });
          }

          return response;
        },
        (error: Error) => {
          triggerHandlers('fetch', {
            ...handlerData,
            endTimestamp: timestampInSeconds() * 1000,
            error,
          });

          if (isError(error) && error.stack === undefined) {
            // NOTE: If you are a Sentry user, and you are seeing this stack frame,
            //       it means the error, that was caused by your fetch call did not
            //       have a stack trace, so the SDK backfilled the stack trace so
            //       you can see which fetch call failed.
            error.stack = virtualError.stack;
            addNonEnumerableProperty(error, 'framesToPop', 1);
          }

          // We enhance fetch error messages with hostname information based on the configuration.
          // Possible messages we handle here:
          // * "Failed to fetch" (chromium)
          // * "Load failed" (webkit)
          // * "NetworkError when attempting to fetch resource." (firefox)
          const client = getClient();
          const enhanceOption = client?.getOptions().enhanceFetchErrorMessages ?? 'always';
          const shouldEnhance = enhanceOption !== false;

          if (
            shouldEnhance &&
            error instanceof TypeError &&
            (error.message === 'Failed to fetch' ||
              error.message === 'Load failed' ||
              error.message === 'NetworkError when attempting to fetch resource.')
          ) {
            try {
              const url = new URL(handlerData.fetchData.url);
              const hostname = url.host;

              if (enhanceOption === 'always') {
                // Modify the error message directly
                error.message = `${error.message} (${hostname})`;
              } else {
                // Store hostname as non-enumerable property for Sentry-only enhancement
                // This preserves the original error message for third-party packages
                addNonEnumerableProperty(error, '__sentry_fetch_url_host__', hostname);
              }
            } catch {
              // ignore it if errors happen here
            }
          }

          // NOTE: If you are a Sentry user, and you are seeing this stack frame,
          //       it means the sentry.javascript SDK caught an error invoking your application code.
          //       This is expected behavior and NOT indicative of a bug with sentry.javascript.
          throw error;
        },
      );
    };
  });
}

async function resolveResponse(res: Response | undefined, onFinishedResolving: () => void): Promise<void> {
  if (res?.body) {
    const body = res.body;
    const responseReader = body.getReader();

    // Define a maximum duration after which we just cancel
    const maxFetchDurationTimeout = setTimeout(
      () => {
        body.cancel().then(null, () => {
          // noop
        });
      },
      90 * 1000, // 90s
    );

    let readingActive = true;
    while (readingActive) {
      let chunkTimeout;
      try {
        // abort reading if read op takes more than 5s
        chunkTimeout = setTimeout(() => {
          body.cancel().then(null, () => {
            // noop on error
          });
        }, 5000);

        // This .read() call will reject/throw when we abort due to timeouts through `body.cancel()`
        const { done } = await responseReader.read();

        clearTimeout(chunkTimeout);

        if (done) {
          onFinishedResolving();
          readingActive = false;
        }
      } catch {
        readingActive = false;
      } finally {
        clearTimeout(chunkTimeout);
      }
    }

    clearTimeout(maxFetchDurationTimeout);

    responseReader.releaseLock();
    body.cancel().then(null, () => {
      // noop on error
    });
  }
}

function streamHandler(response: Response): void {
  // clone response for awaiting stream
  let clonedResponseForResolving: Response;
  try {
    clonedResponseForResolving = response.clone();
  } catch {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  resolveResponse(clonedResponseForResolving, () => {
    triggerHandlers('fetch-body-resolved', {
      endTimestamp: timestampInSeconds() * 1000,
      response,
    });
  });
}

function hasProp<T extends string>(obj: unknown, prop: T): obj is Record<string, string> {
  return !!obj && typeof obj === 'object' && !!(obj as Record<string, string>)[prop];
}

function getUrlFromResource(resource: FetchResource): string {
  if (typeof resource === 'string') {
    return resource;
  }

  if (!resource) {
    return '';
  }

  if (hasProp(resource, 'url')) {
    return resource.url;
  }

  if (resource.toString) {
    return resource.toString();
  }

  return '';
}

/**
 * Parses the fetch arguments to find the used Http method and the url of the request.
 * Exported for tests only.
 */
export function parseFetchArgs(fetchArgs: unknown[]): { method: string; url: string } {
  if (fetchArgs.length === 0) {
    return { method: 'GET', url: '' };
  }

  if (fetchArgs.length === 2) {
    const [resource, options] = fetchArgs as [FetchResource, object];

    return {
      url: getUrlFromResource(resource),
      method: hasProp(options, 'method')
        ? String(options.method).toUpperCase()
        : // Request object as first argument
          isRequest(resource) && hasProp(resource, 'method')
          ? String(resource.method).toUpperCase()
          : 'GET',
    };
  }

  const arg = fetchArgs[0];
  return {
    url: getUrlFromResource(arg as FetchResource),
    method: hasProp(arg, 'method') ? String(arg.method).toUpperCase() : 'GET',
  };
}

function getHeadersFromFetchArgs(fetchArgs: unknown[]): WebFetchHeaders | undefined {
  const [requestArgument, optionsArgument] = fetchArgs;

  try {
    if (
      typeof optionsArgument === 'object' &&
      optionsArgument !== null &&
      'headers' in optionsArgument &&
      optionsArgument.headers
    ) {
      return new Headers(optionsArgument.headers as any);
    }

    if (isRequest(requestArgument)) {
      return new Headers(requestArgument.headers);
    }
  } catch {
    // noop
  }

  return;
}
