import type { GetServerSideProps } from 'next';

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapGetServerSidePropsWithSentry(origGetServerSideProps: GetServerSideProps): GetServerSideProps {
  return new Proxy(origGetServerSideProps, {
    apply: (wrappingTarget, thisArg, args: Parameters<GetServerSideProps>) => {
      return wrappingTarget.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `withSentryGetServerSideProps` instead.
 */
export const withSentryGetServerSideProps = wrapGetServerSidePropsWithSentry;
