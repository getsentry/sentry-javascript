import { Hono } from 'hono';
import { sentry } from '@sentry/hono/bun';
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

export default {
  port,
  fetch: app.fetch,
};
