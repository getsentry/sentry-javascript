import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';

// The auto-instrumentation and the manual `honoMiddleware(app)` are both active.
const app = new Hono();
app.use(Sentry.honoMiddleware(app));

// Counts the Sentry wrappers around the handler that runs. Both setups wrap route handlers, and the
// router reuses the handler list for each request, so without a guard the wrappers would pile up.
// It reads the match result like `hono/route` does.
function wrapperCount(c) {
  const [matchResultKey] = Object.getOwnPropertySymbols(Object.getPrototypeOf(c.req));
  let handler = c.req[matchResultKey][0][c.req.routeIndex][0][0];
  let count = 0;
  while (handler.__sentry_original__) {
    handler = handler.__sentry_original__;
    count++;
  }
  return count;
}

// No route handler here declares `next`, so the SDK does not wrap them.
app.get('/users/me', c => c.json({ wrappers: wrapperCount(c) }));

// A route handler that declares `next`, so the SDK wraps the route handlers of this request.
app.get('/posts/:id', async (c, next) => {
  if (c.req.param('id') === 'draft') {
    await next();
    return;
  }
  return c.json({ wrappers: wrapperCount(c) });
});
app.get('/posts/*', c => c.json({ wrappers: wrapperCount(c) }));

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
