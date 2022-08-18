import { hasTracingEnabled } from '@sentry/tracing';
import { NextPageContext } from 'next';
import { ErrorProps } from 'next/error';

import { isBuild } from '../../utils/isBuild';
import { callTracedServerSideDataFetcher, withErrorInstrumentation } from './wrapperUtils';

type ErrorGetInitialProps = (context: NextPageContext) => Promise<ErrorProps>;

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom error page ("_error.js").
 *
 * @param origErrorGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryServerSideErrorGetInitialProps(
  origErrorGetInitialProps: ErrorGetInitialProps,
): ErrorGetInitialProps {
  return async function (
    ...errorGetInitialPropsArguments: Parameters<ErrorGetInitialProps>
  ): ReturnType<ErrorGetInitialProps> {
    if (isBuild()) {
      return origErrorGetInitialProps(...errorGetInitialPropsArguments);
    }

    const [context] = errorGetInitialPropsArguments;
    const { req, res } = context;

    const errorWrappedGetInitialProps = withErrorInstrumentation(origErrorGetInitialProps);

    if (hasTracingEnabled()) {
      // Since this wrapper is only applied to `getInitialProps` running on the server, we can assert that `req` and
      // `res` are always defined: https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return callTracedServerSideDataFetcher(errorWrappedGetInitialProps, errorGetInitialPropsArguments, req!, res!, {
        dataFetcherRouteName: '/_error',
        requestedRouteName: context.pathname,
        dataFetchingMethodName: 'getInitialProps',
      });
    } else {
      return errorWrappedGetInitialProps(...errorGetInitialPropsArguments);
    }
  };
}
