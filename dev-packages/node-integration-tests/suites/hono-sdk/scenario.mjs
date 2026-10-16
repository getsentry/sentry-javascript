import { serve } from '@hono/node-server';
import { sentry } from '@sentry/hono/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { Hono } from 'hono';

const app = new Hono();

app.use(sentry(app));

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

// Route-name cases. `/users/me` and `/users/:id` overlap; the request is named after the handler that
// responded, not after the last one that matched.
app.get('/users/me', c => c.text('me'));
app.get('/users/:id', c => c.text(`user ${c.req.param('id')}`));

// A middleware that returns early: no route handler runs, so the name falls back to the last matched
// route handler.
app.use('/early/*', async (c, _next) => c.text('blocked by middleware'));
app.get('/early/:id', c => c.text('never reached'));

// A middleware-only path: no route handler matches at all.
app.use('/mw-only/*', async (_c, _next) => new Response('handled by middleware'));

const subApp = new Hono();
subApp.get('/hello', c => c.text('sub hello'));
app.route('/sub', subApp);

app.basePath('/base').get('/hello', c => c.text('base hello'));

app.all('/any-method', c => c.text(`any method: ${c.req.method}`));

// Hono answers `HEAD` with the `GET` route. The SDK records no server span for `HEAD`, so the route
// name is checked on the error event.
app.get('/head-error/:id', () => {
  throw new Error('Test error from a HEAD request');
});

const innerApp = new Hono();
innerApp.get('/item/:itemId', c => c.json({ itemId: c.req.param('itemId') }));
app.get('/outer/:itemId', async c => {
  const res = await innerApp.request(`/item/${c.req.param('itemId')}`);
  return c.json({ outer: c.req.param('itemId'), inner: await res.json() });
});

// A catch-all registered last. It also matches `/users/me` and `/users/:id`, but must not take over
// their names.
app.get('/users/*', c => c.text('users catch-all'));

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
