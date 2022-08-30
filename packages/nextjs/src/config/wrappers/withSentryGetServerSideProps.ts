import { hasTracingEnabled } from '@sentry/tracing';
import { serializeBaggage } from '@sentry/utils';
import { GetServerSideProps } from 'next';

import { isBuild } from '../../utils/isBuild';
import { callTracedServerSideDataFetcher, getTransactionFromRequest, withErrorInstrumentation } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getServerSideProps` function
 *
 * @param origGetServerSideProps The user's `getServerSideProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetServerSideProps(
  origGetServerSideProps: GetServerSideProps,
  parameterizedRoute: string,
): GetServerSideProps {
  return async function (
    ...getServerSidePropsArguments: Parameters<GetServerSideProps>
  ): ReturnType<GetServerSideProps> {
    if (isBuild()) {
      return origGetServerSideProps(...getServerSidePropsArguments);
    }

    const [context] = getServerSidePropsArguments;
    const { req, res } = context;

    const errorWrappedGetServerSideProps = withErrorInstrumentation(origGetServerSideProps);

    if (hasTracingEnabled()) {
      const serverSideProps = await callTracedServerSideDataFetcher(
        errorWrappedGetServerSideProps,
        getServerSidePropsArguments,
        req,
        res,
        {
          dataFetcherRouteName: parameterizedRoute,
          requestedRouteName: parameterizedRoute,
          dataFetchingMethodName: 'getServerSideProps',
        },
      );

      if ('props' in serverSideProps) {
        const requestTransaction = getTransactionFromRequest(req);
        if (requestTransaction) {
          serverSideProps.props._sentryGetServerSidePropsTraceData = requestTransaction.toTraceparent();
          serverSideProps.props._sentryGetServerSidePropsBaggage = serializeBaggage(requestTransaction.getBaggage());
        }
      }

      return serverSideProps;
    } else {
      return origGetServerSideProps(...getServerSidePropsArguments);
    }
  };
}
