import { hasTracingEnabled } from '@sentry/tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type { NextPage } from 'next';

import { isBuild } from './utils/isBuild';
import {
  getTransactionFromRequest,
  withErrorInstrumentation,
  withTracedServerSideDataFetcher,
} from './utils/wrapperUtils';

type GetInitialProps = Required<NextPage>['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapGetInitialPropsWithSentry(origGetInitialProps: GetInitialProps): GetInitialProps {
  return async function (this: unknown, ...args: Parameters<GetInitialProps>): Promise<ReturnType<GetInitialProps>> {
    if (isBuild()) {
      return origGetInitialProps.apply(this, args);
    }

    const [context] = args;
    const { req, res } = context;

    const errorWrappedGetInitialProps = withErrorInstrumentation(origGetInitialProps);

    // Generally we can assume that `req` and `res` are always defined on the server:
    // https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
    // This does not seem to be the case in dev mode. Because we have no clean way of associating the the data fetcher
    // span with each other when there are no req or res objects, we simply do not trace them at all here.
    if (hasTracingEnabled() && req && res) {
      const tracedGetInitialProps = withTracedServerSideDataFetcher(errorWrappedGetInitialProps, req, res, {
        dataFetcherRouteName: context.pathname,
        requestedRouteName: context.pathname,
        dataFetchingMethodName: 'getInitialProps',
      });

      const initialProps: {
        _sentryTraceData?: string;
        _sentryBaggage?: string;
      } = await tracedGetInitialProps.apply(this, args);

      const requestTransaction = getTransactionFromRequest(req);
      if (requestTransaction) {
        initialProps._sentryTraceData = requestTransaction.toTraceparent();

        const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
        initialProps._sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      }

      return initialProps;
    } else {
      return errorWrappedGetInitialProps.apply(this, args);
    }
  };
}

/**
 * @deprecated Use `wrapGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideGetInitialProps = wrapGetInitialPropsWithSentry;
