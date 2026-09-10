import * as Sentry from '@sentry/bun';
import express from 'express';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
});

const app = express();

app.get('/test-param/:id', (request, response) => {
  response.json({ id: request.params.id });
});

app.get('/test-exception/:id', request => {
  throw new Error(`This is an exception with id ${request.params.id}`);
});

app.use((_error, _request, response, _next) => {
  response.status(500).send('Internal Server Error');
});

app.listen(3030, () => {
  // oxlint-disable-next-line no-console
  console.log('Bun Express app listening on port 3030');
});
