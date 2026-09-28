import { Hono } from 'hono';
import { sentry } from '@sentry/hono/bun';
import { addRoutes } from './routes';

const app = new Hono();

app.use(
  sentry(app, {
    dsn: process.env.E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/',
    // Several tests trigger the same server error one after another, which Dedupe would drop.
    integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
  }),
);

addRoutes(app);

const port = Number(process.env.PORT || 38787);

export default {
  port,
  fetch: app.fetch,
};
