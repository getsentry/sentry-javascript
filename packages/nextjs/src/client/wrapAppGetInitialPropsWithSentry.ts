import type App from 'next/app';

type AppGetInitialProps = (typeof App)['getInitialProps'];

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapAppGetInitialPropsWithSentry(origAppGetInitialProps: AppGetInitialProps): AppGetInitialProps {
  return new Proxy(origAppGetInitialProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<AppGetInitialProps>) => {
      return await wrappingTarget.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapAppGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideAppGetInitialProps = wrapAppGetInitialPropsWithSentry;
