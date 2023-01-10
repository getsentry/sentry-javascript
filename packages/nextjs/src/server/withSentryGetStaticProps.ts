import { GetStaticProps } from 'next';

import { isBuild } from './utils/isBuild';
import { callDataFetcherTraced, withErrorInstrumentation } from './utils/wrapperUtils';

type Props = { [key: string]: unknown };

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps The user's `getStaticProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetStaticProps(
  origGetStaticProps: GetStaticProps<Props>,
  parameterizedRoute: string,
): GetStaticProps<Props> {
  return async function (
    ...getStaticPropsArguments: Parameters<GetStaticProps<Props>>
  ): ReturnType<GetStaticProps<Props>> {
    if (isBuild()) {
      return origGetStaticProps(...getStaticPropsArguments);
    }

    const errorWrappedGetStaticProps = withErrorInstrumentation(origGetStaticProps);

    return callDataFetcherTraced(errorWrappedGetStaticProps, getStaticPropsArguments, {
      parameterizedRoute,
      dataFetchingMethodName: 'getStaticProps',
    });
  };
}
