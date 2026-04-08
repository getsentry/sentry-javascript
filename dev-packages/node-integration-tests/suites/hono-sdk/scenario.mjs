import { serve } from '@hono/node-server';
import { sentry } from '@sentry/hono/node';
import { loggingTransport, sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';

const app = new Hono();

app.use(
  sentry(app, {
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1.0,
    transport: loggingTransport,
  }),
);

app.get('/', c => {
  return c.text('Hello from Hono on Node!');
});

app.get('/hello/:name', c => {
  const name = c.req.param('name');
  return c.text(`Hello, ${name}!`);
});

app.get('/error/:param', () => {
  throw new Error('Test error from Hono app');
});

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
