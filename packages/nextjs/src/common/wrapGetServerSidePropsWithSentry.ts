import { getCurrentHub, hasTracingEnabled } from '@sentry/core';
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
  return new Proxy(origGetServerSideProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<GetServerSideProps>) => {
      if (isBuild()) {
        return wrappingTarget.apply(thisArg, args);
      }

      const [context] = args;
      const { req, res } = context;

      const errorWrappedGetServerSideProps = withErrorInstrumentation(wrappingTarget);
      const hub = getCurrentHub();
      const options = hub.getClient()?.getOptions();

      if (hasTracingEnabled() && options?.instrumenter === 'sentry') {
        const tracedGetServerSideProps = withTracedServerSideDataFetcher(errorWrappedGetServerSideProps, req, res, {
          dataFetcherRouteName: parameterizedRoute,
          requestedRouteName: parameterizedRoute,
          dataFetchingMethodName: 'getServerSideProps',
        });

        const serverSideProps = await (tracedGetServerSideProps.apply(thisArg, args) as ReturnType<
          typeof tracedGetServerSideProps
        >);

        if (serverSideProps && 'props' in serverSideProps) {
          const requestTransaction = getTransactionFromRequest(req) ?? hub.getScope().getTransaction();
          if (requestTransaction) {
            serverSideProps.props._sentryTraceData = requestTransaction.toTraceparent();

            const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
            serverSideProps.props._sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
          }
        }

        return serverSideProps;
      } else {
        return errorWrappedGetServerSideProps.apply(thisArg, args);
      }
    },
  });
}

/**
 * @deprecated Use `withSentryGetServerSideProps` instead.
 */
export const withSentryGetServerSideProps = wrapGetServerSidePropsWithSentry;
