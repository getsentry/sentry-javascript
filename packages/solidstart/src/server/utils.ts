import type { EventProcessor, Options } from '@sentry/core';
import { debug } from '@sentry/core';
import { getGlobalScope } from '@sentry/node';

/**
 * Determines if a thrown "error" is a redirect Response which Solid Start users can throw to redirect to another route.
 * see: https://docs.solidjs.com/solid-router/reference/data-apis/response-helpers#redirect
 * @param error the potential redirect error
 */
export function isRedirect(error: unknown): boolean {
  if (error == null || !(error instanceof Response)) {
    return false;
  }

  const hasValidLocation = typeof error.headers.get('location') === 'string';
  const hasValidStatus = error.status >= 300 && error.status <= 308;
  return hasValidLocation && hasValidStatus;
}

/**
 * Filter function for low quality transactions
 *
 * Exported only for tests
 */
export function lowQualityTransactionsFilter(options: Options): EventProcessor {
  return Object.assign(
    (event => {
      if (event.type !== 'transaction') {
        return event;
      }
      // Filter out transactions for build assets
      if (event.transaction?.match(/^GET \/_build\//)) {
        options.debug && debug.log('SolidStartLowQualityTransactionsFilter filtered transaction', event.transaction);
        return null;
      }
      return event;
    }) satisfies EventProcessor,
    { id: 'SolidStartLowQualityTransactionsFilter' },
  );
}

/**
 * Adds an event processor to filter out low quality transactions,
 * e.g. to filter out transactions for build assets
 */
export function filterLowQualityTransactions(options: Options): void {
  getGlobalScope().addEventProcessor(lowQualityTransactionsFilter(options));
}
