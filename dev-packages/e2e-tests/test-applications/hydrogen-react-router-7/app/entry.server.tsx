import '../instrument.server';
import { HandleErrorFunction, ServerRouter } from 'react-router';
import { createContentSecurityPolicy } from '@shopify/hydrogen';
import type { EntryContext } from '@shopify/remix-oxygen';
import { renderToReadableStream } from 'react-dom/server';
import * as Sentry from '@sentry/react-router/cloudflare';

async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  const { nonce, header, NonceProvider } = createContentSecurityPolicy({
    connectSrc: [
      // Need to allow the proxy server to fetch the data
      'http://localhost:3031/',
    ],
  });

  const body = Sentry.injectTraceMetaTags(
    await renderToReadableStream(
      <NonceProvider>
        <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />
      </NonceProvider>,
      {
        nonce,
        signal: request.signal,
      },
    ),
  );

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

export const handleError: HandleErrorFunction = (error, { request }) => {
  // React Router may abort some interrupted requests, don't log those
  if (!request.signal.aborted) {
    Sentry.captureException(error);
    // optionally log the error so you can see it
    console.error(error);
  }
};

export default Sentry.wrapSentryHandleRequest(handleRequest);
