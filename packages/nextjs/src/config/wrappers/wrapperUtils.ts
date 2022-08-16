import { getActiveTransaction } from '@sentry/tracing';

import { DataFetchingFunction } from './types';

/**
 * Create a span to track the wrapped function and update transaction name with parameterized route.
 *
 * @template T Types for `getInitialProps`, `getStaticProps`, and `getServerSideProps`
 * @param origFunction The user's exported `getInitialProps`, `getStaticProps`, or `getServerSideProps` function
 * @param context The context object passed by nextjs to the function
 * @param route The route currently being served
 * @returns The result of calling the user's function
 */
export async function wrapperCore<T extends DataFetchingFunction>(
  origFunction: T['fn'],
  context: T['context'],
  route: string,
): Promise<T['result']> {
  const transaction = getActiveTransaction();

  if (transaction) {
    // Pull off any leading underscores we've added in the process of wrapping the function
    const wrappedFunctionName = origFunction.name.replace(/^_*/, '');

    // TODO: Make sure that the given route matches the name of the active transaction (to prevent background data
    // fetching from switching the name to a completely other route)
    transaction.name = route;
    transaction.metadata.source = 'route';

    // Capture the route, since pre-loading, revalidation, etc might mean that this span may happen during another
    // route's transaction
    const span = transaction.startChild({ op: 'nextjs.data', description: `${wrappedFunctionName} (${route})` });

    // TODO: Can't figure out how to tell TS that the types are correlated - that a `GSPropsFunction` will only get passed
    // `GSPropsContext` and never, say, `GSSPContext`. That's what wrapping everything in objects and using the generic
    // and pulling the types from the generic rather than specifying them directly was supposed to do, but... no luck.
    // eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
    const props = await (origFunction as any)(context);

    span.finish();

    return props;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (origFunction as any)(context);
}
