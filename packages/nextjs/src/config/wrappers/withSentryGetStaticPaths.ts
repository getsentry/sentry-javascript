import type { GSPaths } from './types';
import { callOriginal } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getStaticPaths` function
 *
 * @param origGetStaticPaths: The user's `getStaticPaths` function
 * @returns A wrapped version of the function
 */
export function withSentryGetStaticPaths(origGetStaticPaths: GSPaths['fn']): GSPaths['wrappedFn'] {
  return async function (context: GSPaths['context']): Promise<GSPaths['result']> {
    return callOriginal<GSPaths>(origGetStaticPaths, context);
  };
}
