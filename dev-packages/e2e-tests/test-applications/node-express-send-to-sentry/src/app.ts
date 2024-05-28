import * as Sentry from '@sentry/node';

let lastTransactionId: string | undefined;

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  tracesSampleRate: 1,
  beforeSendTransaction(event) {
    lastTransactionId = event.event_id;
    return event;
  },
});

import express from 'express';

const app = express();
const port = 3030;

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', function (req, res) {
  Sentry.withActiveSpan(null, async () => {
    Sentry.startSpan({ name: 'test-transaction', op: 'e2e-test' }, () => {
      Sentry.startSpan({ name: 'test-span' }, () => undefined);
    });

    await Sentry.flush();

    res.send({
      transactionId: lastTransactionId,
    });
  });
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get('/test-exception/:id', function (req, _res) {
  throw new Error(`This is an exception with id ${req.params.id}`);
});

app.get('/test-local-variables-uncaught', function (req, res) {
  const randomVariableToRecord = Math.random();
  throw new Error(`Uncaught Local Variable Error - ${JSON.stringify({ randomVariableToRecord })}`);
});

app.get('/test-local-variables-caught', function (req, res) {
  const randomVariableToRecord = Math.random();

  let exceptionId: string;
  try {
    throw new Error('Local Variable Error');
  } catch (e) {
    exceptionId = Sentry.captureException(e);
  }

  res.send({ exceptionId, randomVariableToRecord });
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
