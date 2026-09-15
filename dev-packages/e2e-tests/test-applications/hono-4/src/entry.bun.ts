import * as Sentry from '@sentry/bun';
import { Hono } from 'hono';
import { addRoutes } from './routes';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});

const app = new Hono();

addRoutes(app);

const port = Number(process.env.PORT || 38787);

export default {
  port,
  fetch: app.fetch,
};
