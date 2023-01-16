import type App from 'next/app';

type AppGetInitialProps = typeof App['getInitialProps'];

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapAppGetInitialPropsWithSentry(origAppGetInitialProps: AppGetInitialProps): AppGetInitialProps {
  return async function (this: unknown, ...args: Parameters<AppGetInitialProps>): ReturnType<AppGetInitialProps> {
    return await origAppGetInitialProps.apply(this, args);
  };
}

/**
 * @deprecated Use `wrapAppGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideAppGetInitialProps = wrapAppGetInitialPropsWithSentry;
