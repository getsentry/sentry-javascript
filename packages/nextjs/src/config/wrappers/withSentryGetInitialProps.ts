import { NextPage } from 'next';

import { callDataFetcherTraced } from './wrapperUtils';

type GetInitialProps = Required<NextPage<unknown>>['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps: The user's `getInitialProps` function
 * @param origGIPropsHost: The user's object on which `getInitialProps` lives (used for `this`)
 * @returns A wrapped version of the function
 */
export function withSentryGetInitialProps(origGetInitialProps: GetInitialProps, route: string): GetInitialProps {
  return function (...getInitialPropsArguments: Parameters<GetInitialProps>): ReturnType<GetInitialProps> {
    return callDataFetcherTraced(origGetInitialProps, getInitialPropsArguments, { route, op: 'getInitialProps' });
  };
}
