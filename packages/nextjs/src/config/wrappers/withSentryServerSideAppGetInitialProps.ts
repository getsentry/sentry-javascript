import { hasTracingEnabled } from '@sentry/tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import App from 'next/app';

import { isBuild } from '../../utils/isBuild';
import { callTracedServerSideDataFetcher, getTransactionFromRequest, withErrorInstrumentation } from './wrapperUtils';

type AppGetInitialProps = typeof App['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom app ("_app.js").
 *
 * @param origAppGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryServerSideAppGetInitialProps(origAppGetInitialProps: AppGetInitialProps): AppGetInitialProps {
  return async function (
    ...appGetInitialPropsArguments: Parameters<AppGetInitialProps>
  ): ReturnType<AppGetInitialProps> {
    if (isBuild()) {
      return origAppGetInitialProps(...appGetInitialPropsArguments);
    }

    const [context] = appGetInitialPropsArguments;
    const { req, res } = context.ctx;

    const errorWrappedAppGetInitialProps = withErrorInstrumentation(origAppGetInitialProps);

    if (hasTracingEnabled()) {
      // Since this wrapper is only applied to `getInitialProps` running on the server, we can assert that `req` and
      // `res` are always defined: https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      const appGetInitialProps: {
        pageProps: {
          _sentryTraceData?: string;
          _sentryBaggage?: string;
        };
      } = await callTracedServerSideDataFetcher(
        errorWrappedAppGetInitialProps,
        appGetInitialPropsArguments,
        req!,
        res!,
        {
          dataFetcherRouteName: '/_app',
          requestedRouteName: context.ctx.pathname,
          dataFetchingMethodName: 'getInitialProps',
        },
      );

      const requestTransaction = getTransactionFromRequest(req!);
      if (requestTransaction) {
        appGetInitialProps.pageProps._sentryTraceData = requestTransaction.toTraceparent();

        const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
        appGetInitialProps.pageProps._sentryBaggage =
          dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      }

      return appGetInitialProps;
    } else {
      return errorWrappedAppGetInitialProps(...appGetInitialPropsArguments);
    }
  };
}
