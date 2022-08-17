import { NextPage } from 'next';

import { callDataFetcherTraced } from './wrapperUtils';

type GetInitialProps = Required<NextPage<unknown>>['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetInitialProps(
  origGetInitialProps: GetInitialProps,
  parameterizedRoute: string,
): GetInitialProps {
  return async function (
    ...getInitialPropsArguments: Parameters<GetInitialProps>
  ): Promise<ReturnType<GetInitialProps>> {
    return callDataFetcherTraced(origGetInitialProps, getInitialPropsArguments, {
      parameterizedRoute,
      dataFetchingMethodName: 'getInitialProps',
    });
  };
}
