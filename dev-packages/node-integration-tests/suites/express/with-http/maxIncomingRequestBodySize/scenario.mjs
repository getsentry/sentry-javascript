import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import bodyParser from 'body-parser';
import express from 'express';

const app = express();

// Increase limit for JSON parsing
app.use(bodyParser.json({ limit: '3mb' }));
app.use(express.json({ limit: '3mb' }));

app.post('/test-body-size', (req, res) => {
  const receivedSize = JSON.stringify(req.body).length;
  res.json({
    success: true,
    receivedSize,
    message: 'Payload processed successfully',
  });
});

app.post('/ignore-request-body', (req, res) => {
  const receivedSize = JSON.stringify(req.body).length;
  res.json({
    success: true,
    receivedSize,
    message: 'Payload processed successfully',
  });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
