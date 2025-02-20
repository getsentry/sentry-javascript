import { RemixServer } from '@remix-run/react';
import { createContentSecurityPolicy } from '@shopify/hydrogen';
import type { EntryContext } from '@shopify/remix-oxygen';
import isbot from 'isbot';
import { renderToReadableStream } from 'react-dom/server';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  const { nonce, header, NonceProvider } = createContentSecurityPolicy({
    connectSrc: [
      // Need to allow the proxy server to fetch the data
      'http://localhost:3031/',
    ],
  });

  const body = await renderToReadableStream(
    <NonceProvider>
      <RemixServer context={remixContext} url={request.url} />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        // eslint-disable-next-line no-console
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', header);

  // Add the document policy header to enable JS profiling
  // This is required for Sentry's profiling integration
  responseHeaders.set('Document-Policy', 'js-profiling');

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
