import type Document from 'next/document';

type DocumentGetInitialProps = typeof Document.getInitialProps;

/**
 * A passthrough function in case this function is used on the clientside.
 */
export function wrapDocumentGetInitialPropsWithSentry(
  documentGetInitialProps: DocumentGetInitialProps,
): DocumentGetInitialProps {
  return documentGetInitialProps;
}

/**
 * @deprecated Use `wrapDocumentGetInitialPropsWithSentry` instead.
 */
export const withSentryServerSideDocumentGetInitialProps = wrapDocumentGetInitialPropsWithSentry;
