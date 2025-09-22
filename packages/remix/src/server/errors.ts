import type { ActionFunction, ActionFunctionArgs, LoaderFunction, LoaderFunctionArgs } from '@remix-run/node';
import { isRouteErrorResponse } from '@remix-run/router';
import type { RequestEventData, Span } from '@sentry/core';
import {
  addExceptionMechanism,
  captureException,
  debug,
  getClient,
  handleCallbackErrors,
  objectify,
  winterCGRequestToRequestData,
} from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';
import type { RemixOptions } from '../utils/remixOptions';
import { storeFormDataKeys } from '../utils/utils';
import { extractData, isResponse } from '../utils/vendor/response';

type DataFunction = LoaderFunction | ActionFunction;

/**
 * Captures an exception happened in the Remix server.
 *
 * @param err The error to capture.
 * @param name The name of the origin function.
 * @param request The request object.
 *
 * @returns A promise that resolves when the exception is captured.
 */
export async function captureRemixServerException(err: unknown, name: string, request: Request): Promise<void> {
  // Skip capturing if the thrown error is not a 5xx response
  // https://remix.run/docs/en/main/route/loader#throwing-responses-in-loaders
  if (isRouteErrorResponse(err) && err.status < 500) {
    return;
  }

  if (isResponse(err) && err.status < 500) {
    return;
  }
  // Skip capturing if the request is aborted as Remix docs suggest
  // Ref: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
  if (request.signal.aborted) {
    DEBUG_BUILD && debug.warn('Skipping capture of aborted request');
    return;
  }

  let normalizedRequest: RequestEventData = {};

  try {
    normalizedRequest = winterCGRequestToRequestData(request);
  } catch {
    DEBUG_BUILD && debug.warn('Failed to normalize Remix request');
  }

  const objectifiedErr = objectify(err);

  captureException(isResponse(objectifiedErr) ? await extractResponseError(objectifiedErr) : objectifiedErr, scope => {
    scope.setSDKProcessingMetadata({ normalizedRequest });

    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'auto.function.remix.server',
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
 * Wraps the original `DataFunction` with error handling.
 * This function also stores the form data keys if the action is being called.
 *
 * @param origFn The original `DataFunction`.
 * @param name The name of the function.
 * @param args The arguments of the function.
 * @param span The span to store the form data keys.
 *
 * @returns The wrapped `DataFunction`.
 */
export async function errorHandleDataFunction(
  this: unknown,
  origFn: DataFunction,
  name: string,
  args: ActionFunctionArgs | LoaderFunctionArgs,
  span?: Span,
): Promise<Response> {
  return handleCallbackErrors(
    async () => {
      if (name === 'action' && span) {
        const options = getClient()?.getOptions() as RemixOptions | undefined;

        if (options?.sendDefaultPii && options.captureActionFormDataKeys) {
          await storeFormDataKeys(args, span, options.captureActionFormDataKeys);
        }
      }

      return origFn.call(this, args);
    },
    err => {
      // We capture all unexpected errors (except the `Route Error Response`s / Thrown Responses) in `handleError` function.
      // This is both for consistency and also avoid duplicates such as primitives like `string` or `number` being captured twice.
      if (isResponse(err)) {
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
