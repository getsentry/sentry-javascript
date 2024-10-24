import type { NextPage } from 'next';

import { isBuild } from '../utils/isBuild';
import { withErrorInstrumentation, withTracedServerSideDataFetcher } from '../utils/wrapperUtils';

type GetInitialProps = Required<NextPage>['getInitialProps'];

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapGetInitialPropsWithSentry(origGetInitialProps: GetInitialProps): GetInitialProps {
  return new Proxy(origGetInitialProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<GetInitialProps>) => {
      if (isBuild()) {
        return wrappingTarget.apply(thisArg, args);
      }

      const [context] = args;
      const { req, res } = context;

      const errorWrappedGetInitialProps = withErrorInstrumentation(wrappingTarget);
      // Generally we can assume that `req` and `res` are always defined on the server:
      // https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      // This does not seem to be the case in dev mode. Because we have no clean way of associating the the data fetcher
      // span with each other when there are no req or res objects, we simply do not trace them at all here.
      if (req && res) {
        const tracedGetInitialProps = withTracedServerSideDataFetcher(errorWrappedGetInitialProps, req, res, {
          dataFetcherRouteName: context.pathname,
          requestedRouteName: context.pathname,
          dataFetchingMethodName: 'getInitialProps',
        });

        const {
          data: initialProps,
          baggage,
          sentryTrace,
        }: {
          data: {
            _sentryTraceData?: string;
            _sentryBaggage?: string;
          };
          baggage?: string;
          sentryTrace?: string;
        } = (await tracedGetInitialProps.apply(thisArg, args)) ?? {}; // Next.js allows undefined to be returned from a getInitialPropsFunction.

        // The Next.js serializer throws on undefined values so we need to guard for it (#12102)
        if (sentryTrace) {
          initialProps._sentryTraceData = sentryTrace;
        }

        // The Next.js serializer throws on undefined values so we need to guard for it (#12102)
        if (baggage) {
          initialProps._sentryBaggage = baggage;
        }

        return initialProps;
      } else {
        return errorWrappedGetInitialProps.apply(thisArg, args);
      }
    },
  });
}
