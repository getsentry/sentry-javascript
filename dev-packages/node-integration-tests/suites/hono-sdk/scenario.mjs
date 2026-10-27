import { serve } from '@hono/node-server';
import { captureMessage, sentry } from '@sentry/hono/node';
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

// Both routes match `/users/me`. The name must come from the handler that responded.
app.get('/users/me', c => c.text('me'));
app.get('/users/:id', c => c.text(`user ${c.req.param('id')}`));

// The catch-all below also matches. An event from inside this handler must still get this route.
app.get('/users/:id/capture', c => {
  captureMessage('Message from a route handler');
  return c.text('captured');
});

// A middleware that returns early. The request gets the route that would have run.
app.use('/early/*', async (c, _next) => c.text('blocked by middleware'));
app.get('/early/:id', c => c.text('never reached'));

// Only a middleware matches this path.
app.use('/mw-only/*', async (_c, _next) => new Response('handled by middleware'));

const subApp = new Hono();
subApp.get('/hello', c => c.text('sub hello'));
app.route('/sub', subApp);

app.basePath('/base').get('/hello', c => c.text('base hello'));

app.all('/any-method', c => c.text(`any method: ${c.req.method}`));

// Hono answers `HEAD` with the `GET` route. The SDK records no server span for `HEAD`, so the test
// checks the name on the error event.
app.get('/head-error/:id', () => {
  throw new Error('Test error from a HEAD request');
});

const innerApp = new Hono();
innerApp.get('/item/:itemId', c => c.json({ itemId: c.req.param('itemId') }));
app.get('/outer/:itemId', async c => {
  const res = await innerApp.request(`/item/${c.req.param('itemId')}`);
  return c.json({ outer: c.req.param('itemId'), inner: await res.json() });
});

// Passes `draft` on to the catch-all below, which then names the request.
app.get('/posts/:id', async (c, next) => {
  if (c.req.param('id') === 'draft') {
    await next();
    return;
  }
  return c.text('post');
});
app.get('/posts/*', c => {
  captureMessage('Message from a route handler after next()');
  return c.text('fallback');
});

// A catch-all registered last. It also matches `/users/me` and `/users/42`, but must not name them.
app.get('/users/*', c => c.text('users catch-all'));
app.get('/early/*', c => c.text('never reached'));

serve({ fetch: app.fetch, port: 0 }, info => {
  sendPortToRunner(info.port);
});
