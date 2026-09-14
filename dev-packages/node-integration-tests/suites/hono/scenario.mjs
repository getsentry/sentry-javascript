import { serve } from '@hono/node-server';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';

// No `@sentry/hono` and no `sentry()` middleware: the app is instrumented automatically by the
// `honoIntegration` default in `@sentry/node` (via orchestrion hooking the `Hono` constructor).
const app = new Hono();

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
