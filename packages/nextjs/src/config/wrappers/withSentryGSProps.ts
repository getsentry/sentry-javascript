import { GSProps } from './types';
import { callOriginal } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGSProps: The user's `getStaticProps` function
 * @returns A wrapped version of the function
 */
export function withSentryGSProps(origGSProps: GSProps['fn']): GSProps['wrappedFn'] {
  const wrappedGSProps = async function (context: GSProps['context']): Promise<GSProps['result']> {
    return callOriginal<GSProps>(origGSProps, context);
  };

  return wrappedGSProps;
}
