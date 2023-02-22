import type { NextPage } from 'next';

type GetInitialProps = Required<NextPage>['getInitialProps'];

/**
 * A passthrough function in case this function is used on the clientside.
 */
export function wrapGetInitialPropsWithSentry(getInitialProps: GetInitialProps): GetInitialProps {
  return getInitialProps;
}

/**
 * @deprecated Use `wrapGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideGetInitialProps = wrapGetInitialPropsWithSentry;
