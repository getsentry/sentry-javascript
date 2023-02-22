import type { GetServerSideProps } from 'next';

/**
 * A passthrough function in case this function is used on the clientside.
 */
export function wrapGetServerSidePropsWithSentry(getServerSideProps: GetServerSideProps): GetServerSideProps {
  return getServerSideProps;
}

/**
 * @deprecated Use `withSentryGetServerSideProps` instead.
 */
export const withSentryGetServerSideProps = wrapGetServerSidePropsWithSentry;
