import { honoMiddleware } from '@sentry/server-utils';
import { Hono } from 'hono';
import type { Hono as Hono5 } from 'hono-5';
import { describe, it } from 'vitest';
import { sentry as sentryBun } from '../src/bun/middleware';
import { sentry as sentryCloudflare } from '../src/cloudflare/middleware';
import { sentry as sentryDeno } from '../src/deno/middleware';
import { sentry as sentryNode } from '../src/node/middleware';

type AppEnv = { Bindings: { SENTRY_DSN: string }; Variables: { user: string } };

declare const app5: Hono5<AppEnv>;

const dsn = 'https://public@dsn.ingest.sentry.io/1337';

describe('Hono 4', () => {
  it('accepts honoMiddleware(app)', () => {
    const app = new Hono<AppEnv>();
    app.use(honoMiddleware(app));

    const api = app.basePath('/api');
    api.use(honoMiddleware(api));
  });

  it('accepts sentry(app) from each runtime entry', () => {
    const app = new Hono<AppEnv>();
    app.use(sentryNode(app));
    app.use(sentryBun(app, { dsn }));
    app.use(sentryDeno(app, { dsn }));
    app.use(sentryCloudflare(app, env => ({ dsn: env.SENTRY_DSN })));

    const api = app.basePath('/api');
    api.use(sentryNode(api));
  });
});

describe('Hono 5', () => {
  it('accepts honoMiddleware(app)', () => {
    app5.use(honoMiddleware(app5));

    const api = app5.basePath('/api');
    api.use(honoMiddleware(api));
  });

  // In this package, `sentry()` gets its `Hono` type from Hono 4. That class has private members, so a
  // Hono 5 app cannot match it. In a real Hono 5 app, `sentry()` gets the Hono 5 types.
  it('rejects sentry(app) here, because `hono` is Hono 4 in this package', () => {
    // @ts-expect-error -- Hono 5 app, Hono 4 types
    app5.use(sentryNode(app5));
    // @ts-expect-error -- Hono 5 app, Hono 4 types
    app5.use(sentryBun(app5, { dsn }));
    // @ts-expect-error -- Hono 5 app, Hono 4 types
    app5.use(sentryDeno(app5, { dsn }));
    // @ts-expect-error -- Hono 5 app, Hono 4 types
    app5.use(sentryCloudflare(app5, env => ({ dsn: env.SENTRY_DSN })));
  });
});
