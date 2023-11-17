import { addTracingExtensions, getCurrentHub } from '@sentry/core';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type { NextPageContext } from 'next';
import type { ErrorProps } from 'next/error';

import { isBuild } from './utils/isBuild';
import {
  getTransactionFromRequest,
  withErrorInstrumentation,
  withTracedServerSideDataFetcher,
} from './utils/wrapperUtils';

type ErrorGetInitialProps = (context: NextPageContext) => Promise<ErrorProps>;

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom error page ("_error.js").
 *
 * @param origErrorGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapErrorGetInitialPropsWithSentry(
  origErrorGetInitialProps: ErrorGetInitialProps,
): ErrorGetInitialProps {
  return new Proxy(origErrorGetInitialProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<ErrorGetInitialProps>) => {
      if (isBuild()) {
        return wrappingTarget.apply(thisArg, args);
      }

      addTracingExtensions();

      const [context] = args;
      const { req, res } = context;

      const errorWrappedGetInitialProps = withErrorInstrumentation(wrappingTarget);
      const hub = getCurrentHub();
      const options = hub.getClient()?.getOptions();

      // Generally we can assume that `req` and `res` are always defined on the server:
      // https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      // This does not seem to be the case in dev mode. Because we have no clean way of associating the the data fetcher
      // span with each other when there are no req or res objects, we simply do not trace them at all here.
      if (req && res && options?.instrumenter === 'sentry') {
        const tracedGetInitialProps = withTracedServerSideDataFetcher(errorWrappedGetInitialProps, req, res, {
          dataFetcherRouteName: '/_error',
          requestedRouteName: context.pathname,
          dataFetchingMethodName: 'getInitialProps',
        });

        const errorGetInitialProps: ErrorProps & {
          _sentryTraceData?: string;
          _sentryBaggage?: string;
        } = await tracedGetInitialProps.apply(thisArg, args);

        const requestTransaction = getTransactionFromRequest(req) ?? hub.getScope().getTransaction();
        if (requestTransaction) {
          errorGetInitialProps._sentryTraceData = requestTransaction.toTraceparent();

          const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
          errorGetInitialProps._sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
        }

        return errorGetInitialProps;
      } else {
        return errorWrappedGetInitialProps.apply(thisArg, args);
      }
    },
  });
}

/**
 * @deprecated Use `wrapErrorGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideErrorGetInitialProps = wrapErrorGetInitialPropsWithSentry;
