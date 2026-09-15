import { Hono } from 'hono';
import { sentry } from '@sentry/hono/cloudflare';
import { addRoutes } from './routes';

const app = new Hono<{ Bindings: { E2E_TEST_DSN: string } }>();

app.use(
  sentry(app, env => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/',
  })),
);

addRoutes(app);

export default app;
