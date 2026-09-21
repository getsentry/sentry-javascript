import { serve } from '@hono/node-server';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';

// No `@sentry/hono` and no `sentry()` middleware: the app is instrumented automatically by the
// `honoIntegration` default in `@sentry/node` (via orchestrion hooking the `Hono` constructor).
const app = new Hono();

app.get('/', c => {
  return c.text('Hello from Hono on Node!');
});

app.get('/hello/:name', c => {
  const name = c.req.param('name');
  return c.text(`Hello, ${name}!`);
});

app.get('/error/:param', () => {
  throw new Error('Test error from Hono app');
});

// A route handler declared with an unused `next` param (arity 2). It is the last handler in its
// method+path group, so it must be classified as the route handler — not wrapped as a middleware
// span — even though arity alone would misclassify it.
app.get('/arity-two-handler', (c, _next) => c.text('handler with two params'));

// A sub-app with a named middleware, mounted via `app.route()`. The sub-app is also
// auto-instrumented (every `new Hono()` is), so its own Sentry middleware must NOT show up as an
// `<anonymous>` middleware span when it is copied into the parent at mount time.
const subApp = new Hono();
subApp.use(async function subMiddleware(_c, next) {
  await next();
});
subApp.get('/hello', c => c.text('sub hello'));
app.route('/sub', subApp);

// An inner app dispatched to via internal `.request()`. It runs in a fresh Hono context but the same
// isolation scope, so its auto-registered Sentry middleware must be deduplicated — it must not
// re-name the internal-request span, overwrite the request data, or add a middleware span.
const innerApp = new Hono();
innerApp.get('/item/:itemId', c => c.json({ itemId: c.req.param('itemId') }));
innerApp.get('/flaky/:itemId', () => {
  throw new Error('inventory db is down');
});

app.get('/outer/:itemId', async c => {
  const res = await innerApp.request(`/item/${c.req.param('itemId')}`);
  const data = await res.json();
  return c.json({ outer: c.req.param('itemId'), inner: data });
});

// The inner route throws, but the outer handler catches the failed internal response and degrades to
// a 200 instead of propagating. The inner route's error must still reach Sentry.
app.get('/degraded/:itemId', async c => {
  const res = await innerApp.request(`/flaky/${c.req.param('itemId')}`);
  if (!res.ok) {
    return c.json({ item: null, degraded: true }, 200);
  }
  return c.json({ item: await res.json() });
});

app.get('/outer-error/:itemId', async c => {
  // Do a successful internal dispatch first — this is what used to overwrite the request data on the
  // isolation scope — then throw from the outer handler, so the captured error must still carry the
  // outer request's data.
  await innerApp.request(`/item/${c.req.param('itemId')}`);
  throw new Error('Test error from outer Hono app after internal request');
});

// Overlapping handlers: a parameterized handler and a catch-all handler both match `/overlap/:id`.
// The parameterized handler is registered first and responds, so `routeIndex` lands on it and the
// transaction must resolve to `/overlap/:id` — not the catch-all `/*`.
app.get('/overlap/:id', c => c.json({ id: c.req.param('id') }));
app.get('/overlap/*', c => c.text('catch-all handler'));

// Middleware-only match: a scoped middleware short-circuits with its own response and no route
// handler matches. The transaction name must fall back to the matched middleware path `/mw-only/*`.
app.use('/mw-only/*', async (_c, _next) => new Response('handled by middleware'));

// Middleware span status by thrown error (see `wrapMiddlewareWithSpan` + `defaultShouldHandleError`):
// only 5xx and status-less errors set the middleware span to `error` — 3xx and 4xx do not, even
// though they still fail the request.
app.use('/mw-throw/:code', async function throwingMiddleware(c, _next) {
  const status = Number(c.req.param('code'));
  throw Object.assign(new Error(`middleware failed (${status})`), { status });
});
app.get('/mw-throw/:code', c => c.text('never reached'));

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
