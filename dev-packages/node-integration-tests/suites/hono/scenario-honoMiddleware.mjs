import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';

// The auto-instrumentation and the manual `honoMiddleware(app)` are both active.
const app = new Hono();
app.use(Sentry.honoMiddleware(app));

// Counts the Sentry wrappers around the running handler. Two SDK paths wrap route handlers here, and
// the router hands both the same cached handler list on each request, so a missing guard would nest one
// more wrapper per request. The match result is read through the only symbol-keyed getter on the
// request prototype (the one that `hono/route` uses).
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

app.get('/users/me', c => c.json({ wrappers: wrapperCount(c) }));
app.get('/users/:id', c => c.json({ wrappers: wrapperCount(c) }));

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
