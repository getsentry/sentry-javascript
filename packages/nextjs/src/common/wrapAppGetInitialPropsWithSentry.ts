import {
  addTracingExtensions,
  getActiveSpan,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  spanToTraceHeader,
} from '@sentry/core';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type App from 'next/app';

import { isBuild } from './utils/isBuild';
import { getSpanFromRequest, withErrorInstrumentation, withTracedServerSideDataFetcher } from './utils/wrapperUtils';

type AppGetInitialProps = (typeof App)['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom app ("_app.js").
 *
 * @param origAppGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapAppGetInitialPropsWithSentry(origAppGetInitialProps: AppGetInitialProps): AppGetInitialProps {
  return new Proxy(origAppGetInitialProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<AppGetInitialProps>) => {
      if (isBuild()) {
        return wrappingTarget.apply(thisArg, args);
      }

      addTracingExtensions();

      const [context] = args;
      const { req, res } = context.ctx;

      const errorWrappedAppGetInitialProps = withErrorInstrumentation(wrappingTarget);
      // Generally we can assume that `req` and `res` are always defined on the server:
      // https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      // This does not seem to be the case in dev mode. Because we have no clean way of associating the the data fetcher
      // span with each other when there are no req or res objects, we simply do not trace them at all here.
      if (req && res) {
        const tracedGetInitialProps = withTracedServerSideDataFetcher(errorWrappedAppGetInitialProps, req, res, {
          dataFetcherRouteName: '/_app',
          requestedRouteName: context.ctx.pathname,
          dataFetchingMethodName: 'getInitialProps',
        });

        const appGetInitialProps: {
          pageProps: {
            _sentryTraceData?: string;
            _sentryBaggage?: string;
          };
        } = await tracedGetInitialProps.apply(thisArg, args);

        const activeSpan = getActiveSpan();
        const requestSpan = getSpanFromRequest(req) ?? (activeSpan ? getRootSpan(activeSpan) : undefined);

        // Per definition, `pageProps` is not optional, however an increased amount of users doesn't seem to call
        // `App.getInitialProps(appContext)` in their custom `_app` pages which is required as per
        // https://nextjs.org/docs/advanced-features/custom-app - resulting in missing `pageProps`.
        // For this reason, we just handle the case where `pageProps` doesn't exist explicitly.
        if (!appGetInitialProps.pageProps) {
          appGetInitialProps.pageProps = {};
        }

        if (requestSpan) {
          appGetInitialProps.pageProps._sentryTraceData = spanToTraceHeader(requestSpan);
          const dynamicSamplingContext = getDynamicSamplingContextFromSpan(requestSpan);
          appGetInitialProps.pageProps._sentryBaggage =
            dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
        }

        return appGetInitialProps;
      } else {
        return errorWrappedAppGetInitialProps.apply(thisArg, args);
      }
    },
  });
}
