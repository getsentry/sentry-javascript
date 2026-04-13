import cors from 'cors';
import express from 'express';
import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

const app = express();

// cors() would normally create a 'middleware' type span, but the
// ignoreLayersType: ['middleware'] option set via Sentry.init() suppresses it.
app.use(cors());

app.get('/test/express', (_req, res) => {
  res.send({ response: 'response 1' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
