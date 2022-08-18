import { hasTracingEnabled } from '@sentry/tracing';
import { NextPage } from 'next';

import { callTracedServerSideDataFetcher, withErrorInstrumentation } from './wrapperUtils';

type GetInitialProps = Required<NextPage>['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryServerSideGetInitialProps(
  origGetInitialProps: GetInitialProps,
  parameterizedRoute: string,
): GetInitialProps {
  return async function (
    ...getInitialPropsArguments: Parameters<GetInitialProps>
  ): Promise<ReturnType<GetInitialProps>> {
    const [context] = getInitialPropsArguments;
    const { req, res } = context;

    const errorWrappedGetInitialProps = withErrorInstrumentation(origGetInitialProps);

    if (req && res && hasTracingEnabled()) {
      return callTracedServerSideDataFetcher(errorWrappedGetInitialProps, getInitialPropsArguments, req, res, {
        parameterizedRoute,
        functionName: 'getInitialProps',
      });
    } else {
      return errorWrappedGetInitialProps(...getInitialPropsArguments);
    }
  };
}
