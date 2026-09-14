import { Hono } from 'hono';
import { addRoutes } from './routes';
import * as Sentry from '@sentry/deno';

// TODO: This does not work today,
// so we skip this test variant
// wait for https://github.com/apm-js-collab/tracing-hooks/issues/53 to be fixed
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
