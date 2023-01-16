import { hasTracingEnabled } from '@sentry/tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type { GetServerSideProps } from 'next';

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
export function wrapGetServerSidePropsWithSentry(
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

      const {
        dataFetcherResult: serverSidePropsPromise,
        pageloadSpanId,
        pageloadTraceId,
        pageloadTransactionSampled,
      } = await (tracedGetServerSideProps.apply(this, args) as ReturnType<typeof tracedGetServerSideProps>);

      const serverSideProps = await serverSidePropsPromise;

      if ('props' in serverSideProps) {
        const requestTransaction = getTransactionFromRequest(req);
        if (requestTransaction) {
          const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
          serverSideProps.props._sentryPageloadBaggage =
            dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
        }
        serverSideProps.props._sentryPageloadSpanId = pageloadSpanId;
        serverSideProps.props._sentryPageloadTraceId = pageloadTraceId;
        serverSideProps.props._sentryPageloadTraceSampled = pageloadTransactionSampled;
      }

      return serverSideProps;
    } else {
      return errorWrappedGetServerSideProps.apply(this, args);
    }
  };
}

/**
 * @deprecated Use `withSentryGetServerSideProps` instead.
 */
export const withSentryGetServerSideProps = wrapGetServerSidePropsWithSentry;
