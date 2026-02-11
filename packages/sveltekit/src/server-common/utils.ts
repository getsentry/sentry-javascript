import { captureException, objectify } from '@sentry/core';
import type { RequestEvent } from '@sveltejs/kit';
import { isHttpError, isRedirect } from '../common/utils';

/**
 * Takes a request event and extracts traceparent and DSC data
 * from the `sentry-trace` and `baggage` DSC headers.
 *
 * Sets propagation context as a side effect.
 */
export function getTracePropagationData(event: RequestEvent): { sentryTrace: string; baggage: string | null } {
  const sentryTrace = event.request.headers.get('sentry-trace') || '';
  const baggage = event.request.headers.get('baggage');

  return { sentryTrace, baggage };
}

/**
 * Extracts a server-side sveltekit error, filters a couple of known errors we don't want to capture
 * and captures the error via `captureException`.
 *
 * @param e error
 *
 * @returns an objectified version of @param e
 */
export function sendErrorToSentry(e: unknown, handlerFn: 'handle' | 'load' | 'server_route'): object {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // The error() helper is commonly used to throw errors in load functions: https://kit.svelte.dev/docs/modules#sveltejs-kit-error
  // If we detect a thrown error that is an instance of HttpError, we don't want to capture 4xx errors as they
  // could be noisy.
  // Also the `redirect(...)` helper is used to redirect users from one page to another. We don't want to capture thrown
  // `Redirect`s as they're not errors but expected behaviour
  if (
    isRedirect(objectifiedErr) ||
    (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400)
  ) {
    return objectifiedErr;
  }

  captureException(objectifiedErr, {
    mechanism: {
      type: `auto.function.sveltekit.${handlerFn}`,
      handled: false,
    },
  });

  return objectifiedErr;
}
