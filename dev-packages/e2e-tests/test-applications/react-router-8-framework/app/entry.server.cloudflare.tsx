import { captureException } from '@sentry/cloudflare';
import * as Sentry from '@sentry/react-router/cloudflare';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { type EntryContext, type HandleErrorFunction, ServerRouter } from 'react-router';

async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
): Promise<Response> {
  let shellRendered = false;
  const userAgent = request.headers.get('user-agent');
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  const body = await renderToReadableStream(<ServerRouter context={routerContext} url={request.url} nonce={nonce} />, {
    nonce,
    signal: request.signal,
    onError(error: unknown) {
      responseStatusCode = 500;
      // Errors thrown after the shell has flushed can't change the status code, so surface them.
      if (shellRendered) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    },
  });
  shellRendered = true;

  if (userAgent && isbot(userAgent)) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');

  return new Response(Sentry.injectTraceMetaTags(body), {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

export const handleError: HandleErrorFunction = (error, { request }) => {
  if (!request.signal.aborted) {
    captureException(error, { mechanism: { type: 'react-router', handled: false } });
    console.error(error);
  }
};

export default Sentry.wrapSentryHandleRequest(handleRequest);

export const instrumentations = [Sentry.createSentryServerInstrumentation()];
