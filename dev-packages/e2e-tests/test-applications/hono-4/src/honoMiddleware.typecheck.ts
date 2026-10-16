// Type check only: `tsc --noEmit` in `test:build` checks that these calls compile with the real Hono
// types. Nothing imports or runs this file.
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';

type AppEnv = { Bindings: { E2E_TEST_DSN: string }; Variables: { user: string } };

const app = new Hono<AppEnv>();
app.use(Sentry.honoMiddleware(app));
app.use('*', Sentry.honoMiddleware(app));

const api = app.basePath('/api');
api.use(Sentry.honoMiddleware(api));
