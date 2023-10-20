import * as Sentry from '@sentry/node';
import '@sentry/tracing';
import * as Integrations from '@sentry/integrations';
import express from 'express';

declare global {
  namespace globalThis {
    var transactionIds: string[];
  }
}

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  integrations: [new Integrations.HttpClient()],
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

const app = express();
const port = 3030;

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', async function (req, res) {
  const transaction = Sentry.startTransaction({ name: 'test-transaction', op: 'e2e-test' });
  Sentry.getCurrentHub().configureScope(scope => scope.setSpan(transaction));

  const span = transaction.startChild();

  span.finish();
  transaction.finish();

  await Sentry.flush();

  res.send({
    transactionIds: global.transactionIds || [],
  });
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
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

app.use(Sentry.Handlers.errorHandler());

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

Sentry.addGlobalEventProcessor(event => {
  global.transactionIds = global.transactionIds || [];

  if (event.type === 'transaction') {
    const eventId = event.event_id;

    if (eventId) {
      global.transactionIds.push(eventId);
    }
  }

  return event;
});
