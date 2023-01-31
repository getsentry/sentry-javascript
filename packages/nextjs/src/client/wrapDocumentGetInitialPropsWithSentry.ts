import type Document from 'next/document';

type DocumentGetInitialProps = typeof Document.getInitialProps;

/**
 * A passthrough function in case this function is used on the clientside. We need to make the returned function async
 * so we are consistent with the serverside implementation.
 */
export function wrapDocumentGetInitialPropsWithSentry(
  origDocumentGetInitialProps: DocumentGetInitialProps,
): DocumentGetInitialProps {
  return new Proxy(origDocumentGetInitialProps, {
    apply: async (wrappingTarget, thisArg, args: Parameters<DocumentGetInitialProps>) => {
      return await wrappingTarget.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapDocumentGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideDocumentGetInitialProps = wrapDocumentGetInitialPropsWithSentry;
