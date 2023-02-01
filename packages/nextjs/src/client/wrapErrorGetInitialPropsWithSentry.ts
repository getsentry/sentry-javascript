import type { NextPageContext } from 'next';
import type { ErrorProps } from 'next/error';

type ErrorGetInitialProps = (context: NextPageContext) => Promise<ErrorProps>;

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapErrorGetInitialPropsWithSentry(
  origErrorGetInitialProps: ErrorGetInitialProps,
): ErrorGetInitialProps {
  return new Proxy(origErrorGetInitialProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<ErrorGetInitialProps>) => {
      return await wrappingTarget.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapErrorGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideErrorGetInitialProps = wrapErrorGetInitialPropsWithSentry;
