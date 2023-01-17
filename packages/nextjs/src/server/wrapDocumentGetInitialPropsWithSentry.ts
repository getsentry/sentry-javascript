import { getCurrentHub } from '@sentry/node';
import { hasTracingEnabled } from '@sentry/tracing';
import type Document from 'next/document';

import { isBuild } from './utils/isBuild';
import { withErrorInstrumentation, withTracedServerSideDataFetcher } from './utils/wrapperUtils';

type DocumentGetInitialProps = typeof Document.getInitialProps;

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom document ("_document.js").
 *
 * @param origDocumentGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapDocumentGetInitialPropsWithSentry(
  origDocumentGetInitialProps: DocumentGetInitialProps,
): DocumentGetInitialProps {
  return async function (
    this: unknown,
    ...args: Parameters<DocumentGetInitialProps>
  ): ReturnType<DocumentGetInitialProps> {
    if (isBuild()) {
      return origDocumentGetInitialProps.apply(this, args);
    }

    const [context] = args;
    const { req, res } = context;

    const errorWrappedGetInitialProps = withErrorInstrumentation(origDocumentGetInitialProps);
    const options = getCurrentHub().getClient()?.getOptions();

    // Generally we can assume that `req` and `res` are always defined on the server:
    // https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
    // This does not seem to be the case in dev mode. Because we have no clean way of associating the the data fetcher
    // span with each other when there are no req or res objects, we simply do not trace them at all here.
    if (hasTracingEnabled() && req && res && options?.instrumenter === 'sentry') {
      const tracedGetInitialProps = withTracedServerSideDataFetcher(errorWrappedGetInitialProps, req, res, {
        dataFetcherRouteName: '/_document',
        requestedRouteName: context.pathname,
        dataFetchingMethodName: 'getInitialProps',
      });

      const { dataFetcherResult: documentInitialProps } = await (tracedGetInitialProps.apply(this, args) as ReturnType<
        typeof tracedGetInitialProps
      >);

      return documentInitialProps;
    } else {
      return errorWrappedGetInitialProps.apply(this, args);
    }
  };
}

/**
 * @deprecated Use `wrapDocumentGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideDocumentGetInitialProps = wrapDocumentGetInitialPropsWithSentry;
