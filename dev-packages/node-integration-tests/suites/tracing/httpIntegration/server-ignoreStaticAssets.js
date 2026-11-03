const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  // Test default for ignoreStaticAssets: true
  integrations: [
    Sentry.httpIntegration({
      ignoreIncomingRequests: (_url, request) => request.url === '/flush',
    }),
  ],
});

const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/flush', async (_req, res) => {
  await Sentry.flush();
  res.send({ response: 'flushed' });
});

app.get('/test', (_req, res) => {
  res.send({ response: 'ok' });
});

app.get('/favicon.ico', (_req, res) => {
  res.type('image/x-icon').send(Buffer.from([0]));
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow:\n');
});

app.get('/assets/app.js', (_req, res) => {
  res.type('application/javascript').send('/* js */');
});

startExpressServerAndSendPortToRunner(app);
