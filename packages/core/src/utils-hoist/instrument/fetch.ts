/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HandlerDataFetch, WebFetchResponse, WebReadableStreamDefaultReader } from '../../types-hoist';


import { isError } from '../is';
import { addNonEnumerableProperty, fill } from '../object';
import { supportsNativeFetch } from '../supports';
import { timestampInSeconds } from '../time';
import { GLOBAL_OBJ } from '../worldwide';
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

          // NOTE: If you are a Sentry user, and you are seeing this stack frame,
          //       it means the sentry.javascript SDK caught an error invoking your application code.
          //       This is expected behavior and NOT indicative of a bug with sentry.javascript.
          throw error;
        },
      );
    };
  });
}

async function resloveReader(reader: WebReadableStreamDefaultReader, onFinishedResolving: () => void): Promise<void> {
  let running = true;
  while (running) {
    try {
      // This .read() call will reject/throw when `reader.cancel()`
      const { done } = await reader.read();

      running = !done;

      if (done) {
        onFinishedResolving();
      }
    } catch (_) {
      running = false;
    }
  }
}

/**
 * Resolves the body stream of a `Response` object and links its cancellation to a parent `Response` body.
 *
 * This function attaches a custom `cancel` behavior to both the parent `Response` body and its `getReader()` method.
 * When the parent stream or its reader is canceled, it triggers the cancellation of the child stream as well.
 * The function also monitors the resolution of the child's body stream using `resloveReader` and performs cleanup.
 *
 * @param {Response} res - The `Response` object whose body stream will be resolved.
 * @param {Response} parentRes - The parent `Response` object whose body stream is linked to the cancellation of `res`.
 * @param {() => void} onFinishedResolving - A callback function to be invoked when the body stream of `res` is fully resolved.
 *
 * Export For Test Only
 */
export function resolveResponse(
  res: WebFetchResponse,
  parentRes: WebFetchResponse,
  onFinishedResolving: () => void,
): void {
  if (!res.body || !parentRes.body) {
    if (res.body) {
      res.body.cancel().catch(_ => {
        // noop on error
      });
    }

    return;
  }

  const body = res.body;
  const parentBody = parentRes.body;
  // According to the WHATWG Streams API specification, when a stream is locked by calling `getReader()`,
  // invoking `stream.cancel()` will result in a TypeError.
  // To cancel while the stream is locked, must use `reader.cancel()`
  // @seealso: https://streams.spec.whatwg.org
  const responseReader = body.getReader();

  const originalCancel = parentBody.cancel.bind(parentBody) as (reason?: any) => Promise<any>;

  // Override cancel method on parent response's body
  parentBody.cancel = async (reason?: any) => {
    responseReader.cancel('Cancelled by parent stream').catch(_ => {
      // noop on error
    });

    await originalCancel(reason);
  };

  const originalGetReader = parentRes.body.getReader.bind(parentBody) as (
    options: ReadableStreamGetReaderOptions,
  ) => ReadableStreamDefaultReader;

  // Override getReader on parent response's body
  parentBody.getReader = ((opts?: any) => {
    const reader = originalGetReader(opts) as ReadableStreamDefaultReader;

    const originalReaderCancel = reader.cancel.bind(reader) as (reason?: any) => Promise<any>;

    reader.cancel = async (reason?: any) => {
      responseReader.cancel('Cancelled by parent reader').catch(_ => {
        // noop on error
      });

      await originalReaderCancel(reason);
    };

    return reader;
  }) as any;

  resloveReader(responseReader, onFinishedResolving).finally(() => {
    try {
      responseReader.releaseLock();
      body.cancel().catch(() => {
        // noop on error
      });
    } catch (_) {
      // noop on error
    }
  });
}

function streamHandler(response: Response): void {
  // clone response for awaiting stream
  let clonedResponseForResolving: Response;
  try {
    clonedResponseForResolving = response.clone();
  } catch {
    return;
  }

  resolveResponse(clonedResponseForResolving as WebFetchResponse, response as WebFetchResponse, () => {
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
    const [url, options] = fetchArgs as [FetchResource, object];

    return {
      url: getUrlFromResource(url),
      method: hasProp(options, 'method') ? String(options.method).toUpperCase() : 'GET',
    };
  }

  const arg = fetchArgs[0];
  return {
    url: getUrlFromResource(arg as FetchResource),
    method: hasProp(arg, 'method') ? String(arg.method).toUpperCase() : 'GET',
  };
}
