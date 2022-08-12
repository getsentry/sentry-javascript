import { DataFetchingFunction } from './types';

/**
 * Pass-through wrapper for the original function, used as a first step in eventually wrapping the data-fetching
 * functions with code for tracing.
 *
 * @template T Types for `getInitialProps`, `getStaticProps`, and `getServerSideProps`
 * @param origFunction The user's exported `getInitialProps`, `getStaticProps`, or `getServerSideProps` function
 * @param context The context object passed by nextjs to the function
 * @returns The result of calling the user's function
 */
export async function callOriginal<T extends DataFetchingFunction>(
  origFunction: T['fn'],
  context: T['context'],
): Promise<T['result']> {
  let props;

  // TODO: Can't figure out how to tell TS that the types are correlated - that a `GSPropsFunction` will only get passed
  // `GSPropsContext` and never, say, `GSSPContext`. That's what wrapping everything in objects and using the generic
  // and pulling the types from the generic rather than specifying them directly was supposed to do, but... no luck.
  // eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
  props = await (origFunction as any)(context);

  return props;
}
