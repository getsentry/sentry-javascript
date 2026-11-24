import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

// Hono 5 only: `onError()` and `notFound()` register `(c, next)` middleware that reads the error from
// `c.error`. `honoMiddleware(app)` installs the route hook, so the sub-app below is instrumented at mount.
const app = new Hono();
app.use(Sentry.honoMiddleware(app));

app.notFound('/not-found-error/*', () => {
  throw new Error('Error from a not-found handler');
});
app.notFound('/not-found-http-exception/*', () => {
  throw new HTTPException(404, { message: 'Not found from a not-found handler' });
});

app.get('/replace-error', () => {
  throw new Error('Original error from a route handler');
});
app.onError('/replace-error', c => {
  throw new Error('Replacement error from an error handler', { cause: c.error });
});

const subApp = new Hono();
subApp.use(async function subAppMiddleware(_c, next) {
  await next();
});
subApp.onError(
  async function errorMiddleware(_c, next) {
    await next();
  },
  c => c.text('Handled by the sub-app error handler', 500),
);
subApp.get('/fail', () => {
  throw new Error('Error from a sub-app route');
});
app.route('/sub', subApp);

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
