import { honoMiddleware } from '@sentry/cloudflare';
import { Hono } from 'hono';
import { addRoutes } from './routes';

const app = new Hono<{ Bindings: { E2E_TEST_DSN: string } }>();

// Cloudflare Workers build the app at module scope, where workerd disallows the diagnostics_channel
// publishing the automatic `honoIntegration` relies on. Register the middleware manually instead — it
// applies the same instrumentation without diagnostics_channel.
app.use(honoMiddleware(app));

addRoutes(app);

export default app;
