import { hasTracingEnabled } from '@sentry/tracing';
import Document from 'next/document';

import { isBuild } from '../../utils/isBuild';
import { callTracedServerSideDataFetcher, withErrorInstrumentation } from './wrapperUtils';

type DocumentGetInitialProps = typeof Document.getInitialProps;

/**
 * Create a wrapped version of the user's exported `getInitialProps` function in
 * a custom document ("_document.js").
 *
 * @param origDocumentGetInitialProps The user's `getInitialProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function withSentryServerSideDocumentGetInitialProps(
  origDocumentGetInitialProps: DocumentGetInitialProps,
): DocumentGetInitialProps {
  return async function (
    ...documentGetInitialPropsArguments: Parameters<DocumentGetInitialProps>
  ): ReturnType<DocumentGetInitialProps> {
    if (isBuild()) {
      return origDocumentGetInitialProps(...documentGetInitialPropsArguments);
    }

    const [context] = documentGetInitialPropsArguments;
    const { req, res } = context;

    const errorWrappedGetInitialProps = withErrorInstrumentation(origDocumentGetInitialProps);

    if (hasTracingEnabled()) {
      // Since this wrapper is only applied to `getInitialProps` running on the server, we can assert that `req` and
      // `res` are always defined: https://nextjs.org/docs/api-reference/data-fetching/get-initial-props#context-object
      return callTracedServerSideDataFetcher(
        errorWrappedGetInitialProps,
        documentGetInitialPropsArguments,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        req!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        res!,
        {
          dataFetcherRouteName: '/_document',
          requestedRouteName: context.pathname,
          dataFetchingMethodName: 'getInitialProps',
        },
      );
    } else {
      return errorWrappedGetInitialProps(...documentGetInitialPropsArguments);
    }
  };
}
