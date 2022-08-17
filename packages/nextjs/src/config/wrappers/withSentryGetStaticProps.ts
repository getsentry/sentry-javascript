import { GetStaticProps } from 'next';

import { callDataFetcherTraced } from './wrapperUtils';

type Props = { [key: string]: unknown };

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps: The user's `getStaticProps` function
 * @param parameterizedRoute - The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetStaticProps(
  origGetStaticProps: GetStaticProps<Props>,
  parameterizedRoute: string,
): GetStaticProps<Props> {
  return async function (
    ...getStaticPropsArguments: Parameters<GetStaticProps<Props>>
  ): ReturnType<GetStaticProps<Props>> {
    return callDataFetcherTraced(origGetStaticProps, getStaticPropsArguments, {
      parameterizedRoute,
      dataFetchingMethodName: 'getStaticProps',
    });
  };
}
