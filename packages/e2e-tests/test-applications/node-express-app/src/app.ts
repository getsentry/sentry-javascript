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
  integrations: [new Integrations.HttpClient()],
  debug: true,
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
