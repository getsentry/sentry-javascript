import { captureException, flushIfServerless } from '@sentry/core';
import type { ActionFunctionArgs, HandleErrorFunction, LoaderFunctionArgs } from 'react-router';

export type SentryHandleErrorOptions = {
  logErrors?: boolean;
};

/**
 * A complete Sentry-instrumented handleError implementation that handles error reporting
 *
 * @returns A Sentry-instrumented handleError function
 */
export function createSentryHandleError({ logErrors = false }: SentryHandleErrorOptions): HandleErrorFunction {
  const handleError = async function handleError(
    error: unknown,
    args: LoaderFunctionArgs | ActionFunctionArgs,
  ): Promise<void> {
    // React Router may abort some interrupted requests, don't report those
    if (!args.request.signal.aborted) {
      captureException(error, {
        mechanism: {
          type: 'react-router',
          handled: false,
        },
      });
      if (logErrors) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
      try {
        await flushIfServerless();
      } catch {
        // Ignore flush errors to ensure error handling completes gracefully
      }
    }
  };

  return handleError;
}
