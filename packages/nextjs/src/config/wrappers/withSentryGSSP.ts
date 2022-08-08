import { GSSP } from './types';
import { callOriginal } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getServerSideProps` function
 *
 * @param origGSSP: The user's `getServerSideProps` function
 * @returns A wrapped version of the function
 */
export function withSentryGSSP(origGSSP: GSSP['fn']): GSSP['wrappedFn'] {
  const wrappedGSSP = async function (context: GSSP['context']): Promise<GSSP['result']> {
    return callOriginal<GSSP>(origGSSP, context);
  };

  return wrappedGSSP;
}
