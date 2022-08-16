import { GetServerSideProps } from 'next';

import { callDataFetcherTraced } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getServerSideProps` function
 *
 * @param origGetServerSideProps: The user's `getServerSideProps` function
 * @param route: The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetServerSideProps(
  origGetServerSideProps: GetServerSideProps,
  route: string,
): GetServerSideProps {
  return function (...getServerSidePropsArguments: Parameters<GetServerSideProps>): ReturnType<GetServerSideProps> {
    return callDataFetcherTraced(origGetServerSideProps, getServerSidePropsArguments, {
      route,
      op: 'getServerSideProps',
    });
  };
}
