import { captureException, consoleSandbox } from '@sentry/core';
import { flushIfServerless } from '@sentry/server-utils';
import type { AnyErrorHandler, SentryHandleServerErrorInput } from '../common/handleErrorTypes';
import { shouldCaptureError } from '../common/handleErrorTypes';
import { getCloudflareExecutionContext } from './utils';

type ServerErrorHandler = (input: SentryHandleServerErrorInput) => unknown;

/**
 * The default shape of the wrapped hook: structurally compatible with SvelteKit's
 * `HandleServerError` on every supported major.
 */
type SentryHandleServerError = (input: SentryHandleServerErrorInput) => Promise<void | App.Error>;

// Mirrors SvelteKit's own default error handler, which differs by major version:
// - SvelteKit 1.x/2.x log the error's stack trace
// - SvelteKit 3 only logs unexpected errors (walking the `cause` chain), and logs the issues of
//   remote function validation errors
// see: https://github.com/sveltejs/kit/blob/49f0808f3e983d0cb5a4d586cf0d1678467431ed/packages/kit/src/runtime/server/index.js#L132-L156
function defaultErrorHandler(input: SentryHandleServerErrorInput): void {
  if (input.kind === 'validation') {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error('Remote function schema validation failed:', input.issues);
    });
    return;
  }

  const { kind, error } = input;

  if (kind && kind !== 'unknown') {
    // Don't log stack traces for expected app errors or framework errors like 404s
    return;
  }

  consoleSandbox(() => {
    if (!kind) {
      // SvelteKit 1.x/2.x
      // eslint-disable-next-line no-console
      console.error((error as Error | undefined)?.stack);
      return;
    }

    let e = error;
    while (e instanceof Error) {
      if (e.stack) {
        // eslint-disable-next-line no-console
        console.error(e.stack);
      }
      // `Error.cause` needs a lib newer than the one we compile against
      e = (e as Error & { cause?: unknown }).cause;
    }

    if (e) {
      // eslint-disable-next-line no-console
      console.error(String(e));
    }
  });
}

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry<T extends AnyErrorHandler = SentryHandleServerError>(handleError?: T): T {
  const errorHandler = (handleError ?? defaultErrorHandler) as ServerErrorHandler;

  const sentryErrorHandler = async (input: SentryHandleServerErrorInput): Promise<unknown> => {
    if (!shouldCaptureError(input, () => isExpectedLegacyError(input))) {
      return errorHandler(input);
    }

    captureException(input.error, {
      mechanism: {
        type: 'auto.function.sveltekit.handle_error',
        handled: !!handleError,
      },
    });

    const cloudflareCtx = getCloudflareExecutionContext(input.event?.platform);

    // Cloudflare workers have a `waitUntil` method on `ctx` that we can use to flush the event queue
    // We already call this in `wrapRequestHandler` from `sentryHandleInitCloudflare`
    // However, `handleError` can be invoked when wrapRequestHandler already finished
    // (e.g. when responses are streamed / returning promises from load functions)
    if (typeof cloudflareCtx?.waitUntil === 'function') {
      await flushIfServerless({ cloudflareCtx });
    } else {
      await flushIfServerless();
    }

    return errorHandler(input);
  };

  // Returning `T` (the caller's own hook type) is what keeps the result assignable to
  // `HandleServerError` on both SvelteKit 2 and 3. The wrapper itself is written against our
  // structural input type, which TS can't prove is identical to `T`, so it can't be narrowed
  // without the double cast.
  return sentryErrorHandler as unknown as T;
}

/**
 * Whether a SvelteKit 1.x/2.x error is an expected one we don't want to capture: a "Not found"
 * error for an unmatched route, or any other 4xx.
 *
 * SvelteKit 3 errors are classified by `shouldCaptureError` instead.
 */
function isExpectedLegacyError(input: SentryHandleServerErrorInput): boolean {
  if (input.kind) {
    // Not a SvelteKit 1.x/2.x input - narrows the union so `status` below is readable
    return false;
  }

  const { error, event, status } = input;

  // SvelteKit 2.0 offers a reliable way to check for a Not Found error:
  if (!!status && status >= 400 && status < 500) {
    return true;
  }

  // SvelteKit 1.x doesn't offer a reliable way to check for a Not Found error.
  // So we check the route id (shouldn't exist) and the raw stack trace
  // We can delete all of this below whenever we drop Kit 1.x support
  const hasNoRouteId = !event?.route?.id;

  const rawStack: string =
    (error != null &&
      typeof error === 'object' &&
      'stack' in error &&
      typeof error.stack === 'string' &&
      error.stack) ||
    '';

  return hasNoRouteId && rawStack.startsWith('Error: Not found:');
}
