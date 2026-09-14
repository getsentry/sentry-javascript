import { Hono } from 'hono';
import { addRoutes } from './routes';
import * as Sentry from '@sentry/deno';

Sentry.init({
  dsn: Deno.env.get('E2E_TEST_DSN'),
  environment: 'qa',
  dataCollection: {},
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});

const app = new Hono();

addRoutes(app);

const port = Number(Deno.env.get('PORT') || 38787);

Deno.serve({ port }, app.fetch);
