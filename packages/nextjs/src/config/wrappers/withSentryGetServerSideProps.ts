import { GSSP } from './types';
import { wrapperCore } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getServerSideProps` function
 *
 * @param origGetServerSideProps: The user's `getServerSideProps` function
 * @param route: The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetServerSideProps(origGetServerSideProps: GSSP['fn'], route: string): GSSP['wrappedFn'] {
  return async function (context: GSSP['context']): Promise<GSSP['result']> {
    return wrapperCore<GSSP>(origGetServerSideProps, context, route);
  };
}
