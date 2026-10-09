const Sentry = require('@sentry/node');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');
const express = require('express');

const app = express();

app.get('/test', async (_req, res) => {
  Sentry.captureException(new Error('test error'));
  // Flush the error before the request ends and its root span is sent.
  await Sentry.flush();
  res.json({ success: true });
});

startExpressServerAndSendPortToRunner(app);
