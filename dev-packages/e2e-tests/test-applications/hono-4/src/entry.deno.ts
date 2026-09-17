import { Hono } from 'hono';
import { sentry } from '@sentry/hono/deno';
import { addRoutes } from './routes';

const app = new Hono();

app.use(
  sentry(app, {
    dsn: Deno.env.get('E2E_TEST_DSN'),
    environment: 'qa',
    dataCollection: {},
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/',
  }),
);

addRoutes(app);

const port = Number(Deno.env.get('PORT') || 38787);

Deno.serve({ port }, app.fetch);
