import type { AppData, DataFunctionArgs, EntryContext, HandleDocumentRequestFunction } from '@remix-run/node';
import {
  captureException,
  getActiveSpan,
  getClient,
  getRootSpan,
  handleCallbackErrors,
  spanToJSON,
} from '@sentry/core';
import type { Span } from '@sentry/types';
import { addExceptionMechanism, isPrimitive, logger, objectify } from '@sentry/utils';
import { DEBUG_BUILD } from './debug-build';
import type { RemixOptions } from './remixOptions';
import { storeFormDataKeys } from './utils';
import { extractData, isResponse, isRouteErrorResponse } from './vendor/response';
import type { DataFunction, RemixRequest } from './vendor/types';
import { normalizeRemixRequest } from './web-fetch';

/**
 * Captures an exception happened in the Remix server.
 *
 * @param err The error to capture.
 * @param name The name of the origin function.
 * @param request The request object.
 *
 * @returns A promise that resolves when the exception is captured.
 */
export async function captureRemixServerException(
  err: unknown,
  name: string,
  request: Request,
  isRemixV2: boolean = true,
): Promise<void> {
  // Skip capturing if the thrown error is not a 5xx response
  // https://remix.run/docs/en/v1/api/conventions#throwing-responses-in-loaders
  if (isRemixV2 && isRouteErrorResponse(err) && err.status < 500) {
    return;
  }

  if (isResponse(err) && err.status < 500) {
    return;
  }
  // Skip capturing if the request is aborted as Remix docs suggest
  // Ref: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
  if (request.signal.aborted) {
    DEBUG_BUILD && logger.warn('Skipping capture of aborted request');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let normalizedRequest: Record<string, unknown> = request as unknown as any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    normalizedRequest = normalizeRemixRequest(request as unknown as any);
  } catch (e) {
    DEBUG_BUILD && logger.warn('Failed to normalize Remix request');
  }

  const objectifiedErr = objectify(err);

  captureException(isResponse(objectifiedErr) ? await extractResponseError(objectifiedErr) : objectifiedErr, scope => {
    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);
    const activeRootSpanName = rootSpan ? spanToJSON(rootSpan).description : undefined;

    scope.setSDKProcessingMetadata({
      request: {
        ...normalizedRequest,
        // When `route` is not defined, `RequestData` integration uses the full URL
        route: activeRootSpanName
          ? {
              path: activeRootSpanName,
            }
          : undefined,
      },
    });

    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'instrument',
        handled: false,
        data: {
          function: name,
        },
      });

      return event;
    });

    return scope;
  });
}

/**
 *
 */
export function errorHandleDocumentRequestFunction(
  this: unknown,
  origDocumentRequestFunction: HandleDocumentRequestFunction,
  requestContext: {
    request: RemixRequest;
    responseStatusCode: number;
    responseHeaders: Headers;
    context: EntryContext;
    loadContext?: Record<string, unknown>;
  },
  isRemixV2: boolean,
): HandleDocumentRequestFunction {
  const { request, responseStatusCode, responseHeaders, context, loadContext } = requestContext;

  return handleCallbackErrors(
    () => {
      return origDocumentRequestFunction.call(this, request, responseStatusCode, responseHeaders, context, loadContext);
    },
    err => {
      // This exists to capture the server-side rendering errors on Remix v1
      // On Remix v2, we capture SSR errors at `handleError`
      // We also skip primitives here, as we can't dedupe them, and also we don't expect any primitive SSR errors.
      if (!isRemixV2 && !isPrimitive(err)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        captureRemixServerException(err, 'documentRequest', request, isRemixV2);
      }

      throw err;
    },
  );
}

/**
 *
 */
export async function errorHandleDataFunction(
  this: unknown,
  origFn: DataFunction,
  name: string,
  args: DataFunctionArgs,
  isRemixV2: boolean,
  span?: Span,
): Promise<Response | AppData> {
  return handleCallbackErrors(
    async () => {
      if (name === 'action' && span) {
        const options = getClient()?.getOptions() as RemixOptions;

        if (options.sendDefaultPii && options.captureActionFormDataKeys) {
          await storeFormDataKeys(args, span);
        }
      }

      return origFn.call(this, args);
    },
    err => {
      // On Remix v2, we capture all unexpected errors (except the `Route Error Response`s / Thrown Responses) in `handleError` function.
      // This is both for consistency and also avoid duplicates such as primitives like `string` or `number` being captured twice.
      // Remix v1 does not have a `handleError` function, so we capture all errors here.
      if (isRemixV2 ? isResponse(err) : true) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        captureRemixServerException(err, name, args.request);
      }

      throw err;
    },
  );
}

async function extractResponseError(response: Response): Promise<unknown> {
  const responseData = await extractData(response);

  if (typeof responseData === 'string' && responseData.length > 0) {
    return new Error(responseData);
  }

  if (response.statusText) {
    return new Error(response.statusText);
  }

  return responseData;
}
