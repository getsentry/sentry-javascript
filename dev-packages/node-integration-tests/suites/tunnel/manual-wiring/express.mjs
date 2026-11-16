import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

app.get('/dsn', (_request, response) => {
  response.send(process.env.SENTRY_DSN);
});

// The test's last request, so the runner only stops the scenario after every check.
app.get('/done', (_request, response) => {
  Sentry.captureMessage('done');
  response.send('ok');
});

// The tunnel posts `application/x-sentry-envelope`, which `express.json()` leaves alone.
app.use(express.json());

// Middleware style
app.use((request, response, next) => Sentry.handleTunnelRequestIfMatched(request, response) ?? next());

// Route style
app.post('/route-tunnel', (request, response) => Sentry.handleTunnelRequest(request, response));

// A parser that reads every body leaves the tunnel nothing to forward.
app.post('/parsed-tunnel', express.raw({ type: '*/*' }), (request, response) =>
  Sentry.handleTunnelRequest(request, response),
);

app.use((_request, response) => {
  response.send('app');
});

const server = app.listen(0, () => {
  sendPortToRunner(server.address().port);
});
