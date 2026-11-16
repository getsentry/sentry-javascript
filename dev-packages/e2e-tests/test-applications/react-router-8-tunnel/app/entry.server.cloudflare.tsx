import { captureException } from '@sentry/cloudflare';
import * as Sentry from '@sentry/react-router/cloudflare';
import { renderToReadableStream } from 'react-dom/server';
import { type HandleErrorFunction, ServerRouter } from 'react-router';

export default Sentry.createSentryHandleRequest({ renderToReadableStream, ServerRouter });

export const handleError: HandleErrorFunction = error => {
  captureException(error, { mechanism: { type: 'react-router', handled: false } });
};
