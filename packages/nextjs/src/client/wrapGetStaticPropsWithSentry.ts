import type { GetStaticProps } from 'next';

type Props = { [key: string]: unknown };

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapGetStaticPropsWithSentry(origGetStaticProps: GetStaticProps<Props>): GetStaticProps<Props> {
  return new Proxy(origGetStaticProps, {
    apply: (wrappingTarget, thisArg, args: Parameters<GetStaticProps<Props>>) => {
      return wrappingTarget.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapGetStaticPropsWithSentry` instead.
 */
export const withSentryGetStaticProps = wrapGetStaticPropsWithSentry;
