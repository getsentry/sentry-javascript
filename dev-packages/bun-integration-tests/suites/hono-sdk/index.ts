import { sentry } from '@sentry/hono/bun';
import { Hono } from 'hono';

const app = new Hono();

app.use(
  sentry(app, {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
);

app.get('/', c => {
  return c.text('Hello from Hono on Bun!');
});

app.get('/hello/:name', c => {
  const name = c.req.param('name');
  return c.text(`Hello, ${name}!`);
});

app.get('/error/:param', () => {
  throw new Error('Test error from Hono app');
});

const server = Bun.serve({
  port: 0,
  fetch: app.fetch,
});

process.send?.(JSON.stringify({ event: 'READY', port: server.port }));
