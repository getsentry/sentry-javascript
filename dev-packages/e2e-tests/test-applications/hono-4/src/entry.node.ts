import { Hono } from 'hono';
import { sentry } from '@sentry/hono/node';
import { serve } from '@hono/node-server';
import { addRoutes } from './routes';

const app = new Hono<{ Bindings: { E2E_TEST_DSN: string } }>();

app.use(
  // @ts-expect-error - Env is not yet in type
  sentry(app, {
    dsn: process.env.E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/',
  }),
);

addRoutes(app);

const port = Number(process.env.PORT || 38787);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Hono (Node) listening on port ${port}`);
});
