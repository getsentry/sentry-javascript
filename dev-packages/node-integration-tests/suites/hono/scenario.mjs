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

app.get('/outer/:itemId', async c => {
  const res = await innerApp.request(`/item/${c.req.param('itemId')}`);
  const data = await res.json();
  return c.json({ outer: c.req.param('itemId'), inner: data });
});

app.get('/outer-error/:itemId', async c => {
  // Do a successful internal dispatch first — this is what used to overwrite the request data on the
  // isolation scope — then throw from the outer handler, so the captured error must still carry the
  // outer request's data.
  await innerApp.request(`/item/${c.req.param('itemId')}`);
  throw new Error('Test error from outer Hono app after internal request');
});

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
