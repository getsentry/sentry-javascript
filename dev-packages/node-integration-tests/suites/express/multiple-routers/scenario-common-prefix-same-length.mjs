import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

const APIv1 = express.Router();

APIv1.get('/:userId', function (_req, res) {
  Sentry.captureMessage('Custom Message');
  res.send('Success');
});

const root = express.Router();

app.use('/api', root);
app.use('/api/v1', APIv1);

startExpressServerAndSendPortToRunner(app);
