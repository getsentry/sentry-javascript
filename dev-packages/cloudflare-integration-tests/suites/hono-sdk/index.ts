import { sentry } from '@sentry/hono/cloudflare';
import { Hono } from 'hono';

interface Env {
  SENTRY_DSN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  sentry(app, {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    debug: true,
    // fixme - check out what removing this integration changes
    // integrations: integrations => integrations.filter(integration => integration.name !== 'Hono'),
  }),
);

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

export default app;
