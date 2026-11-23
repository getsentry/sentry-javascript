import { createReadableStreamFromReadable } from '@react-router/node';
import * as Sentry from '@sentry/react-router';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';

export default Sentry.createSentryHandleRequest({
  ServerRouter,
  renderToPipeableStream,
  createReadableStreamFromReadable,
});

export const handleError = Sentry.createSentryHandleError({ logErrors: false });
