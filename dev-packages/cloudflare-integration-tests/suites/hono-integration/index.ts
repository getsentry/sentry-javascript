import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';

interface Env {
  SENTRY_DSN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', c => {
  return c.text('Hello from Hono on Cloudflare!');
});

app.get('/json', c => {
  return c.json({ message: 'Hello from Hono', framework: 'hono', platform: 'cloudflare' });
});

app.get('/error', () => {
  throw new Error('Test error from Hono app');
});

app.get('/hello/:name', c => {
  const name = c.req.param('name');
  return c.text(`Hello, ${name}!`);
});

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  app,
);
