// Import this first!
import './instrument';

// Now import other modules
import * as Sentry from '@sentry/node-core';
import express from 'express';

const app = express();
const port = 3030;

app.get('/test-transaction', function (req, res) {
  Sentry.withActiveSpan(null, async () => {
    Sentry.startSpan({ name: 'test-transaction', op: 'e2e-test' }, () => {
      Sentry.startSpan({ name: 'test-span' }, () => undefined);
    });

    await Sentry.flush();

    res.send({
      transactionIds: global.transactionIds || [],
    });
  });
});

app.get('/test-exception/:id', function (req, _res) {
  try {
    throw new Error(`This is an exception with id ${req.params.id}`);
  } catch (e) {
    Sentry.captureException(e);
    throw e;
  }
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
