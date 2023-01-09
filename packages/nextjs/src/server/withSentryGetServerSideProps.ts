import { hasTracingEnabled } from '@sentry/tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import { GetServerSideProps } from 'next';

import { isBuild } from './utils/isBuild';
import {
  getTransactionFromRequest,
  withErrorInstrumentation,
  withTracedServerSideDataFetcher,
} from './utils/wrapperUtils';

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
  return async function (this: unknown, ...args: Parameters<GetServerSideProps>): ReturnType<GetServerSideProps> {
    if (isBuild()) {
      return origGetServerSideProps.apply(this, args);
    }

    const [context] = args;
    const { req, res } = context;

    const errorWrappedGetServerSideProps = withErrorInstrumentation(origGetServerSideProps);

    if (hasTracingEnabled()) {
      const tracedGetServerSideProps = withTracedServerSideDataFetcher(errorWrappedGetServerSideProps, req, res, {
        dataFetcherRouteName: parameterizedRoute,
        requestedRouteName: parameterizedRoute,
        dataFetchingMethodName: 'getServerSideProps',
      });

      const serverSideProps = await (tracedGetServerSideProps.apply(this, args) as ReturnType<
        typeof tracedGetServerSideProps
      >);

      if ('props' in serverSideProps) {
        const requestTransaction = getTransactionFromRequest(req);
        if (requestTransaction) {
          serverSideProps.props._sentryTraceData = requestTransaction.toTraceparent();

          const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
          serverSideProps.props._sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
        }
      }

      return serverSideProps;
    } else {
      return errorWrappedGetServerSideProps.apply(this, args);
    }
  };
}
