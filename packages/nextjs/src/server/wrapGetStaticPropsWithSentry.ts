import { getCurrentHub } from '@sentry/node';
import { hasTracingEnabled } from '@sentry/tracing';
import type { GetStaticProps } from 'next';

import { isBuild } from './utils/isBuild';
import { callDataFetcherTraced, withErrorInstrumentation } from './utils/wrapperUtils';

type Props = { [key: string]: unknown };

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps The user's `getStaticProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapGetStaticPropsWithSentry(
  origGetStaticProps: GetStaticProps<Props>,
  parameterizedRoute: string,
): GetStaticProps<Props> {
  return async function (
    ...getStaticPropsArguments: Parameters<GetStaticProps<Props>>
  ): ReturnType<GetStaticProps<Props>> {
    if (isBuild()) {
      return origGetStaticProps(...getStaticPropsArguments);
    }

    const errorWrappedGetStaticProps = withErrorInstrumentation(origGetStaticProps);
    const options = getCurrentHub().getClient()?.getOptions();

    if (hasTracingEnabled() && options?.instrumenter === 'sentry') {
      return callDataFetcherTraced(errorWrappedGetStaticProps, getStaticPropsArguments, {
        parameterizedRoute,
        dataFetchingMethodName: 'getStaticProps',
      });
    }

    return errorWrappedGetStaticProps(...getStaticPropsArguments);
  };
}

/**
 * @deprecated Use `wrapGetStaticPropsWithSentry` instead.
 */
export const withSentryGetStaticProps = wrapGetStaticPropsWithSentry;
