/* eslint-disable no-console */
import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

app.use(Sentry.Handlers.requestHandler());

// ### Taken from manual tests ###
// Hack that resets the 60s default flush interval, and replaces it with just a one second interval
// @ts-expect-error: need access to `_sessionFlusher`
const flusher = (Sentry.getCurrentHub()?.getClient() as Sentry.NodeClient)?._sessionFlusher;

// @ts-expect-error: need access to `_intervalId`
let flusherIntervalId = flusher?._intervalId;

clearInterval(flusherIntervalId);

// @ts-expect-error: need access to `_intervalId`
flusherIntervalId = flusher?._intervalId = setInterval(() => flusher?.flush(), 2000);

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

app.use(Sentry.Handlers.errorHandler());

export default app;
