import { captureException } from '@sentry/core';
import { getActiveTransaction } from '@sentry/tracing';
import { Span } from '@sentry/types';

/**
 * Call a data fetcher and trace it. Only traces the function if there is an active transaction on the scope.
 *
 * We only do the following until we move transaction creation into this function: When called, the wrapped function
 * will also update the name of the active transaction with a parameterized route provided via the `options` argument.
 */
export async function callDataFetcherTraced<F extends (...args: any[]) => Promise<any> | any>(
  origFunction: F,
  origFunctionArgs: Parameters<F>,
  options: {
    route: string;
    op: string;
  },
): Promise<ReturnType<F>> {
  const { route, op } = options;

  const transaction = getActiveTransaction();

  if (!transaction) {
    return origFunction(...origFunctionArgs);
  }

  // Pull off any leading underscores we've added in the process of wrapping the function
  const wrappedFunctionName = origFunction.name.replace(/^_*/, '');

  // TODO: Make sure that the given route matches the name of the active transaction (to prevent background data
  // fetching from switching the name to a completely other route) -- We'll probably switch to creating a transaction
  // right here so making that check will probabably not even be necessary.
  // Logic will be: If there is no active transaction, start one with correct name and source. If there is an active
  // transaction, create a child span with correct name and source.
  transaction.name = route;
  transaction.metadata.source = 'route';

  // Capture the route, since pre-loading, revalidation, etc might mean that this span may happen during another
  // route's transaction
  const span = transaction.startChild({ op: 'nextjs.data', description: `${wrappedFunctionName} (${route})` });

  try {
    return await origFunction(...origFunctionArgs);
  } finally {
    span.finish();
  }
}
