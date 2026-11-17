import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();
let releaseFirst;
const secondRequestStarted = new Promise(resolve => {
  releaseFirst = resolve;
});

app.get('/:request', async (req, res) => {
  if (req.params.request === 'first') {
    process.stdout.write('FIRST_STARTED\n');
    await secondRequestStarted;
  } else {
    releaseFirst();
  }

  Sentry.captureException(new Error(req.params.request));
  Sentry.logger.info('Request handled');
  Sentry.metrics.count('request_count', 1);
  res.send({ ok: true });
  setImmediate(() => {
    void Sentry.flush();
  });
});

startExpressServerAndSendPortToRunner(app);
