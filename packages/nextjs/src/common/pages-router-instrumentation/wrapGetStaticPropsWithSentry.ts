import type { GetStaticProps } from 'next';

import { isBuild } from '../utils/isBuild';
import { callDataFetcherTraced, withErrorInstrumentation } from '../utils/wrapperUtils';

type Props = { [key: string]: unknown };

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps The user's `getStaticProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapGetStaticPropsWithSentry(
  origGetStaticPropsa: GetStaticProps<Props>,
  _parameterizedRoute: string,
): GetStaticProps<Props> {
  return new Proxy(origGetStaticPropsa, {
    apply: async (wrappingTarget, thisArg, args: Parameters<GetStaticProps<Props>>) => {
      if (isBuild()) {
        return wrappingTarget.apply(thisArg, args);
      }

      const errorWrappedGetStaticProps = withErrorInstrumentation(wrappingTarget);
      return callDataFetcherTraced(errorWrappedGetStaticProps, args);
    },
  });
}
