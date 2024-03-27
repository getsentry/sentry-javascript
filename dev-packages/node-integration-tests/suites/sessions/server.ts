import type { SessionFlusher } from '@sentry/core';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

import express from 'express';

const app = express();

// ### Taken from manual tests ###
// Hack that resets the 60s default flush interval, and replaces it with just a one second interval
const flusher = (Sentry.getClient() as Sentry.NodeClient)['_sessionFlusher'] as SessionFlusher;

let flusherIntervalId = flusher && flusher['_intervalId'];

clearInterval(flusherIntervalId);

flusherIntervalId = flusher['_intervalId'] = setInterval(() => flusher?.flush(), 2000);

setTimeout(() => clearInterval(flusherIntervalId), 4000);

app.get('/test/success', (_req, res) => {
  res.send('Success!');
});

app.get('/test/success_next', (_req, res, next) => {
  res.send('Success!');
  next();
});

app.get('/test/success_slow', async (_req, res) => {
  await new Promise(res => setTimeout(res, 50));

  res.send('Success!');
});

app.get('/test/error_unhandled', () => {
  throw new Error('Crash!');
});

app.get('/test/error_handled', (_req, res) => {
  try {
    throw new Error('Crash!');
  } catch (e) {
    Sentry.captureException(e);
  }
  res.send('Crash!');
});

Sentry.setupExpressErrorHandler(app);

export default app;
