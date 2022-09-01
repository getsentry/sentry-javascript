import { hasTracingEnabled } from '@sentry/tracing';
import { serializeBaggage } from '@sentry/utils';
import { NextPage } from 'next';

import { isBuild } from '../../utils/isBuild';
import { callTracedServerSideDataFetcher, getTransactionFromRequest, withErrorInstrumentation } from './wrapperUtils';

type GetInitialProps = Required<NextPage>['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryServerSideGetInitialProps(origGetInitialProps: GetInitialProps): GetInitialProps {
  return async function (
    ...getInitialPropsArguments: Parameters<GetInitialProps>
  ): Promise<ReturnType<GetInitialProps>> {
    if (isBuild()) {
      return origGetInitialProps(...getInitialPropsArguments);
    }

    const [context] = getInitialPropsArguments;
    const { req, res } = context;

    const errorWrappedGetInitialProps = withErrorInstrumentation(origGetInitialProps);

    if (hasTracingEnabled()) {
      // Since this wrapper is only applied to `getInitialProps` running on the server, we can assert that `req` and
      // `res` are always defined: https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      const initialProps: {
        _sentryTraceData?: string;
        _sentryBaggage?: string;
      } = await callTracedServerSideDataFetcher(errorWrappedGetInitialProps, getInitialPropsArguments, req!, res!, {
        dataFetcherRouteName: context.pathname,
        requestedRouteName: context.pathname,
        dataFetchingMethodName: 'getInitialProps',
      });

      const requestTransaction = getTransactionFromRequest(req!);
      if (requestTransaction) {
        initialProps._sentryTraceData = requestTransaction.toTraceparent();
        initialProps._sentryBaggage = serializeBaggage(requestTransaction.getBaggage());
      }

      return initialProps;
    } else {
      return errorWrappedGetInitialProps(...getInitialPropsArguments);
    }
  };
}
