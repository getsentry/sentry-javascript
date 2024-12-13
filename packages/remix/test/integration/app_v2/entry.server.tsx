import * as Sentry from '@sentry/remix';

import type { EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { renderToString } from 'react-dom/server';

const handleErrorImpl = () => {
  Sentry.setTag('remix-test-tag', 'remix-test-value');
};

export const handleError = Sentry.wrapHandleErrorWithSentry(handleErrorImpl);

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  let markup = renderToString(<RemixServer context={remixContext} url={request.url} />);

  responseHeaders.set('Content-Type', 'text/html');

  return new Response('<!DOCTYPE html>' + markup, {
    status: responseStatusCode,
    headers: responseHeaders,
  });
}
