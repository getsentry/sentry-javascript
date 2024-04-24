import { getActiveSpan, getDynamicSamplingContextFromSpan, getRootSpan, spanToTraceHeader } from '@sentry/core';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type { GetServerSideProps } from 'next';

import { isBuild } from './utils/isBuild';
import { getSpanFromRequest, withErrorInstrumentation, withTracedServerSideDataFetcher } from './utils/wrapperUtils';

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
      const tracedGetServerSideProps = withTracedServerSideDataFetcher(errorWrappedGetServerSideProps, req, res, {
        dataFetcherRouteName: parameterizedRoute,
        requestedRouteName: parameterizedRoute,
        dataFetchingMethodName: 'getServerSideProps',
      });

      const serverSideProps = await (tracedGetServerSideProps.apply(thisArg, args) as ReturnType<
        typeof tracedGetServerSideProps
      >);

      if (serverSideProps && 'props' in serverSideProps) {
        const activeSpan = getActiveSpan();
        const requestTransaction = getSpanFromRequest(req) ?? (activeSpan ? getRootSpan(activeSpan) : undefined);
        if (requestTransaction) {
          (serverSideProps.props as Record<string, unknown>)._sentryTraceData = spanToTraceHeader(requestTransaction);

          const dynamicSamplingContext = getDynamicSamplingContextFromSpan(requestTransaction);
          (serverSideProps.props as Record<string, unknown>)._sentryBaggage =
            dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
        }
      }

      return serverSideProps;
    },
  });
}
