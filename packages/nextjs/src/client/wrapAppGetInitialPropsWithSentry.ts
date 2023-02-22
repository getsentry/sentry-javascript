import type App from 'next/app';

type AppGetInitialProps = typeof App['getInitialProps'];

/**
 * A passthrough function in case this function is used on the clientside.
 */
export function wrapAppGetInitialPropsWithSentry(appGetInitialProps: AppGetInitialProps): AppGetInitialProps {
  return appGetInitialProps;
}

/**
 * @deprecated Use `wrapAppGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideAppGetInitialProps = wrapAppGetInitialPropsWithSentry;
