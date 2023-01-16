import { hasTracingEnabled } from '@sentry/tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type App from 'next/app';

import { isBuild } from './utils/isBuild';
import {
  getTransactionFromRequest,
  withErrorInstrumentation,
  withTracedServerSideDataFetcher,
} from './utils/wrapperUtils';

type AppGetInitialProps = typeof App['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom app ("_app.js").
 *
 * @param origAppGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapAppGetInitialPropsWithSentry(origAppGetInitialProps: AppGetInitialProps): AppGetInitialProps {
  return async function (this: unknown, ...args: Parameters<AppGetInitialProps>): ReturnType<AppGetInitialProps> {
    if (isBuild()) {
      return origAppGetInitialProps.apply(this, args);
    }

    const [context] = args;
    const { req, res } = context.ctx;

    const errorWrappedAppGetInitialProps = withErrorInstrumentation(origAppGetInitialProps);

    // Generally we can assume that `req` and `res` are always defined on the server:
    // https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
    // This does not seem to be the case in dev mode. Because we have no clean way of associating the the data fetcher
    // span with each other when there are no req or res objects, we simply do not trace them at all here.
    if (hasTracingEnabled() && req && res) {
      const tracedGetInitialProps = withTracedServerSideDataFetcher(errorWrappedAppGetInitialProps, req, res, {
        dataFetcherRouteName: '/_app',
        requestedRouteName: context.ctx.pathname,
        dataFetchingMethodName: 'getInitialProps',
      });

      const {
        dataFetcherResult: appInitialProps,
        pageloadSpanId,
        pageloadTraceId,
        pageloadTransactionSampled,
      } = await (tracedGetInitialProps.apply(this, args) as ReturnType<typeof tracedGetInitialProps>);

      const requestTransaction = getTransactionFromRequest(req);

      // Per definition, `pageProps` is not optional, however an increased amount of users doesn't seem to call
      // `App.getInitialProps(appContext)` in their custom `_app` pages which is required as per
      // https://nextjs.org/docs/advanced-features/custom-app - resulting in missing `pageProps`.
      // For this reason, we just handle the case where `pageProps` doesn't exist explicitly.
      if (!appInitialProps.pageProps) {
        appInitialProps.pageProps = {};
      }

      if (requestTransaction) {
        const dynamicSamplingContext = requestTransaction.getDynamicSamplingContext();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        appInitialProps.pageProps._sentryPageloadBaggage =
          dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appInitialProps.pageProps._sentryPageloadSpanId = pageloadSpanId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appInitialProps.pageProps._sentryPageloadTraceId = pageloadTraceId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      appInitialProps.pageProps._sentryPageloadTraceSampled = pageloadTransactionSampled;

      return appInitialProps;
    } else {
      return errorWrappedAppGetInitialProps.apply(this, args);
    }
  };
}

/**
 * @deprecated Use `wrapAppGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideAppGetInitialProps = wrapAppGetInitialPropsWithSentry;
