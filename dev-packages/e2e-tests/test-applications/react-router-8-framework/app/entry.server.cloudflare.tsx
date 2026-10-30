import { captureException } from '@sentry/cloudflare';
import * as Sentry from '@sentry/react-router/cloudflare';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type HandleErrorFunction } from 'react-router';

export default Sentry.createSentryHandleRequest({
  renderToReadableStream,
  ServerRouter,
  getNonce: () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
});

export const handleError: HandleErrorFunction = (error, { request }) => {
  if (!request.signal.aborted) {
    captureException(error, { mechanism: { type: 'react-router', handled: false } });
    console.error(error);
  }
};

export const instrumentations = [Sentry.createSentryServerInstrumentation()];
