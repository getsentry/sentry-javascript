import { GetServerSideProps } from 'next';

import { isBuild } from '../../utils/isBuild';
import { callTracedServerSideDataFetcher, withErrorInstrumentation } from './wrapperUtils';

/**
 * Create a wrapped version of the user's exported `getServerSideProps` function
 *
 * @param origGetServerSideProps The user's `getServerSideProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryGetServerSideProps(
  origGetServerSideProps: GetServerSideProps,
  parameterizedRoute: string,
): GetServerSideProps {
  return async function (
    ...getServerSidePropsArguments: Parameters<GetServerSideProps>
  ): ReturnType<GetServerSideProps> {
    if (isBuild()) {
      return origGetServerSideProps(...getServerSidePropsArguments);
    }

    const [context] = getServerSidePropsArguments;
    const { req, res } = context;

    const errorWrappedGetServerSideProps = withErrorInstrumentation(origGetServerSideProps);

    if (hasTracingEnabled()) {
      return callTracedServerSideDataFetcher(errorWrappedGetServerSideProps, getServerSidePropsArguments, req, res, {
        parameterizedRoute,
        functionName: 'getServerSideProps',
      });
    } else {
      return errorWrappedGetServerSideProps(...getServerSidePropsArguments);
    }
  };
}
