import { GSProps } from './types';
import { wrapperCore } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps: The user's `getStaticProps` function
 * @param route: The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetStaticProps(origGetStaticProps: GSProps['fn'], route: string): GSProps['wrappedFn'] {
  return async function (context: GSProps['context']): Promise<GSProps['result']> {
    return wrapperCore<GSProps>(origGetStaticProps, context, route);
  };
}
