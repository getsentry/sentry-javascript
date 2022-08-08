import type { GSPaths } from './types';
import { callOriginal } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getStaticPaths` function
 *
 * @param origGSPaths: The user's `getStaticPaths` function
 * @returns A wrapped version of the function
 */
export function withSentryGSPaths(origGSPaths: GSPaths['fn']): GSPaths['wrappedFn'] {
  const wrappedGSPaths = async function (context: GSPaths['context']): Promise<GSPaths['result']> {
    return callOriginal<GSPaths>(origGSPaths, context);
  };

  return wrappedGSPaths;
}
