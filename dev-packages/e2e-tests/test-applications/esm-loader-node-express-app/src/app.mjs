import * as Sentry from '@sentry/node';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

import express from 'express';

const app = express();
const port = 3030;

app.get('/test-success', function (req, res) {
  setTimeout(() => {
    res.status(200).end();
  }, 100);
});

app.get('/test-transaction/:param', function (req, res) {
  setTimeout(() => {
    res.status(200).end();
  }, 100);
});

app.get('/test-error', function (req, res) {
  Sentry.captureException(new Error('This is an error'));
  setTimeout(() => {
    Sentry.flush(2000).then(() => {
      res.status(200).end();
    });
  }, 100);
});

Sentry.setupExpressErrorHandler(app);

// @ts-ignore
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
