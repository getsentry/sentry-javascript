import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();
let releaseFirst;
const secondRequestStarted = new Promise(resolve => {
  releaseFirst = resolve;
});

async function handleRequest(req, res) {
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
}

app.get('/:request', (req, res) => {
  if (process.env.FRAMEWORK_ROOT === 'forked-scope') {
    return Sentry.withIsolationScope(() =>
      Sentry.startSpan({ name: 'GET /:request', op: 'http.server' }, () => handleRequest(req, res)),
    );
  }
  if (process.env.FRAMEWORK_ROOT === 'late-op') {
    return Sentry.startSpan({ name: 'GET /:request' }, () => handleRequest(req, res));
  }
  return handleRequest(req, res);
});

startExpressServerAndSendPortToRunner(app);
