import type * as S from '@sentry/node';
const Sentry = require('@sentry/node') as typeof S;

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  integrations: [],
  tracesSampleRate: 1,
  tunnel: 'http://localhost:3031/', // proxy server
  tracePropagationTargets: ['http://localhost:3030', '/external-allowed'],
});

import type * as H from 'http';
import type C from 'connect';

const connect = require('connect') as typeof C;
const http = require('http') as typeof H;

const app = connect();
const port = 3030;

app.use('/test-success', (req, res, next) => {
  res.end(
    JSON.stringify({
      version: 'v1',
    }),
  );
});

app.use('/test-error', async (req, res, next) => {
  const exceptionId = Sentry.captureException(new Error('Sentry Test Error'));

  await Sentry.flush();

  res.end(JSON.stringify({ exceptionId }));
  next();
});

app.use('/test-exception', () => {
  throw new Error('This is an exception');
});

app.use('/test-transaction', (req, res, next) => {
  Sentry.startSpan({ name: 'test-span' }, () => {});

  res.end(
    JSON.stringify({
      version: 'v1',
    }),
  );

  next();
});

Sentry.setupConnectErrorHandler(app);

const server = http.createServer(app);

server.listen(port);
