import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';

const app = express();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  // disable attaching headers to /test/* endpoints
  tracePropagationTargets: [/^(?!.*test).*$/],
  integrations: [new Sentry.Integrations.Http({ tracing: true }), new Sentry.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(cors());

app.get('/test/express', (_req, res) => {
  res.send({ response: 'response 1' });
});

app.get(/\/test\/regex/, (_req, res) => {
  res.send({ response: 'response 2' });
});

app.get(['/test/array1', /\/test\/array[2-9]/], (_req, res) => {
  res.send({ response: 'response 3' });
});

app.get(['/test/arr/:id', /\/test\/arr[0-9]*\/required(path)?(\/optionalPath)?\/(lastParam)?/], (_req, res) => {
  res.send({ response: 'response 4' });
});

app.use(Sentry.Handlers.errorHandler());

export default app;
