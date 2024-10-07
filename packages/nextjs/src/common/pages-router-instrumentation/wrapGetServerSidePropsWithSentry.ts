import type { GetServerSideProps } from 'next';

import { isBuild } from '../utils/isBuild';
import { withErrorInstrumentation, withTracedServerSideDataFetcher } from '../utils/wrapperUtils';

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

      const {
        data: serverSideProps,
        baggage,
        sentryTrace,
      } = await (tracedGetServerSideProps.apply(thisArg, args) as ReturnType<typeof tracedGetServerSideProps>);

      if (serverSideProps && 'props' in serverSideProps) {
        // The Next.js serializer throws on undefined values so we need to guard for it (#12102)
        if (sentryTrace) {
          (serverSideProps.props as Record<string, unknown>)._sentryTraceData = sentryTrace;
        }

        // The Next.js serializer throws on undefined values so we need to guard for it (#12102)
        if (baggage) {
          (serverSideProps.props as Record<string, unknown>)._sentryBaggage = baggage;
        }
      }

      return serverSideProps;
    },
  });
}
