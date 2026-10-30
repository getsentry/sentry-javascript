import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

// Consumes the body of every request, which the tunnel must not be affected by.
app.use(express.json());

// The app's own handler on the tunnel path, which the runtime answers before it.
app.post(process.env.TUNNEL_PATH, (_req, res) => {
  res.status(418).send('app tunnel handler');
});

app.get('/health', (_req, res) => {
  res.send('ok');
});

app.get('/done', (_req, res) => {
  Sentry.captureMessage('done');
  res.send('done');
});

startExpressServerAndSendPortToRunner(app);
