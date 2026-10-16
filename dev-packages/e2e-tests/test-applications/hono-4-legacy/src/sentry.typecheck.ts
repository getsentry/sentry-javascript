// Only `tsc` in `test:build` reads this file. Nothing runs it.
import { sentry as sentryBun } from '@sentry/hono/bun';
import { sentry as sentryCloudflare } from '@sentry/hono/cloudflare';
import { sentry as sentryDeno } from '@sentry/hono/deno';
import { sentry as sentryNode } from '@sentry/hono/node';
import { Hono } from 'hono';

type AppEnv = { Bindings: { E2E_TEST_DSN: string }; Variables: { user: string } };

const dsn = 'https://public@dsn.ingest.sentry.io/1337';

const app = new Hono<AppEnv>();
app.use(sentryNode(app));
app.use(sentryBun(app, { dsn }));
app.use(sentryDeno(app, { dsn }));
app.use(sentryCloudflare(app, env => ({ dsn: env.E2E_TEST_DSN })));

const api = app.basePath('/api');
api.use(sentryNode(api));
