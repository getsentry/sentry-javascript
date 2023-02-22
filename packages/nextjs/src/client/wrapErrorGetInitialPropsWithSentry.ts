import type { NextPageContext } from 'next';
import type { ErrorProps } from 'next/error';

type ErrorGetInitialProps = (context: NextPageContext) => Promise<ErrorProps>;

/**
 * A passthrough function in case this function is used on the clientside.
 */
export function wrapErrorGetInitialPropsWithSentry(errorGetInitialProps: ErrorGetInitialProps): ErrorGetInitialProps {
  return errorGetInitialProps;
}

/**
 * @deprecated Use `wrapErrorGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideErrorGetInitialProps = wrapErrorGetInitialPropsWithSentry;
