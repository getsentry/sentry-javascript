import type { NextPage } from 'next';

type GetInitialProps = Required<NextPage>['getInitialProps'];

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapGetInitialPropsWithSentry(origGetInitialProps: GetInitialProps): GetInitialProps {
  return new Proxy(origGetInitialProps, {
    apply: (wrappingTarget, thisArg, args: Parameters<GetInitialProps>) => {
      return wrappingTarget.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideGetInitialProps = wrapGetInitialPropsWithSentry;
