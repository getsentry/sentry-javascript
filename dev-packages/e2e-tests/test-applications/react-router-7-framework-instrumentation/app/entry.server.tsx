import { createReadableStreamFromReadable } from '@react-router/node';
import * as Sentry from '@sentry/react-router';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';
import { type HandleErrorFunction } from 'react-router';

const ABORT_DELAY = 5_000;

const handleRequest = Sentry.createSentryHandleRequest({
  streamTimeout: ABORT_DELAY,
  ServerRouter,
  renderToPipeableStream,
  createReadableStreamFromReadable,
});

export default handleRequest;

export const handleError: HandleErrorFunction = Sentry.createSentryHandleError({ logErrors: true });

// Use Sentry's instrumentation API for server-side tracing
// `unstable_instrumentations` is React Router 7.x's export name (will become `instrumentations` in v8)
export const unstable_instrumentations = [Sentry.createSentryServerInstrumentation()];
