import type { GetStaticProps } from 'next';

type Props = { [key: string]: unknown };

/**
 * A passthrough function in case this function is used on the clientside.
 */
export function wrapGetStaticPropsWithSentry(getStaticProps: GetStaticProps<Props>): GetStaticProps<Props> {
  return getStaticProps;
}

/**
 * @deprecated Use `wrapGetStaticPropsWithSentry` instead.
 */
export const withSentryGetStaticProps = wrapGetStaticPropsWithSentry;
