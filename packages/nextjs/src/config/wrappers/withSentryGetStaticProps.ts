import { GetStaticProps } from 'next';

import { callDataFetcherTraced } from './wrapperUtils';

type Props = { [key: string]: unknown };

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps: The user's `getStaticProps` function
 * @param route: The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetStaticProps(
  origGetStaticProps: GetStaticProps<Props>,
  route: string,
): GetStaticProps<Props> {
  return function (...getStaticPropsArguments: Parameters<GetStaticProps<Props>>): ReturnType<GetStaticProps<Props>> {
    return callDataFetcherTraced(origGetStaticProps, getStaticPropsArguments, { route, op: 'getStaticProps' });
  };
}
