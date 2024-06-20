import {
  getActiveSpan,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  spanIsValid,
  spanToTraceHeader,
} from '@sentry/core';
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
        const requestSpan = getSpanFromRequest(req) ?? (activeSpan ? getRootSpan(activeSpan) : undefined);

        if (requestSpan && spanIsValid(requestSpan)) {
          const sentryTrace = spanToTraceHeader(requestSpan);

          // The Next.js serializer throws on undefined values so we need to guard for it (#12102)
          if (sentryTrace) {
            (serverSideProps.props as Record<string, unknown>)._sentryTraceData = sentryTrace;
          }

          const dynamicSamplingContext = getDynamicSamplingContextFromSpan(requestSpan);
          const baggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
          // The Next.js serializer throws on undefined values so we need to guard for it (#12102)
          if (baggage) {
            (serverSideProps.props as Record<string, unknown>)._sentryBaggage = baggage;
          }
        }
      }

      return serverSideProps;
    },
  });
}
