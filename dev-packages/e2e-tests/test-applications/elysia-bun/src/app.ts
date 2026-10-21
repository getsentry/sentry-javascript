import * as Sentry from '@sentry/elysia';
import { Elysia } from 'elysia';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  tracePropagationTargets: ['http://localhost:3030', '/external-allowed'],
});

const app = Sentry.withElysia(new Elysia());

// Simple success route
app.get('/test-success', () => ({ version: 'v1' }));

// Parameterized route
app.get('/test-param/:param', ({ params }) => ({ paramWas: params.param }));

// Multiple params
app.get('/test-multi-param/:param1/:param2', ({ params }) => ({
  param1: params.param1,
  param2: params.param2,
}));

// Route that throws an error (will be caught by onError)
app.get('/test-exception/:id', ({ params }) => {
  throw new Error(`This is an exception with id ${params.id}`);
});

// Route with a custom span
app.get('/test-transaction', () => {
  Sentry.startSpan({ name: 'test-span' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });
  return { status: 'ok' };
});

// Route with specific middleware via .guard or .use
app.group('/with-middleware', app =>
  app
    .onBeforeHandle(() => {
      // This is a route-specific middleware
    })
    .get('/test', () => ({ middleware: true })),
);

// Error with specific status code
app.post('/test-post-error', () => {
  throw new Error('Post error');
});

// Route that returns a non-500 error
app.get('/test-4xx', ({ set }) => {
  set.status = 400;
  return { error: 'Bad Request' };
});

// Error that reaches the error handler with status still set to 200 (unusual, should still be captured)
app.get('/test-error-with-200-status', ({ set }) => {
  set.status = 200;
  throw new Error('Error with 200 status');
});

// POST route that echoes body
app.post('/test-post', ({ body }) => ({ status: 'ok', body }));

// Route that returns inbound headers (for propagation tests)
app.get('/test-inbound-headers/:id', ({ params, request }) => {
  const headers = Object.fromEntries(request.headers.entries());
  return { headers, id: params.id };
});

// Outgoing fetch propagation
app.get('/test-outgoing-fetch/:id', async ({ params }) => {
  const id = params.id;
  const response = await fetch(`http://localhost:3030/test-inbound-headers/${id}`);
  const data = await response.json();
  return data;
});

// Outgoing fetch to external (allowed by tracePropagationTargets)
app.get('/test-outgoing-fetch-external-allowed', async () => {
  const response = await fetch(`http://localhost:3040/external-allowed`);
  const data = await response.json();
  return data;
});

// Outgoing fetch to external (disallowed by tracePropagationTargets)
app.get('/test-outgoing-fetch-external-disallowed', async () => {
  const response = await fetch(`http://localhost:3040/external-disallowed`);
  const data = await response.json();
  return data;
});

// Route that throws a string (not an Error object)
app.get('/test-string-error', () => {
  // eslint-disable-next-line no-throw-literal
  throw 'String error message';
});

// Route for concurrent isolation tests — returns scope data in response
app.get('/test-isolation/:userId', async ({ params }) => {
  Sentry.setUser({ id: params.userId });
  Sentry.setTag('user_id', params.userId);

  // Simulate async work to increase overlap between concurrent requests
  await new Promise(resolve => setTimeout(resolve, 200));

  return {
    userId: params.userId,
    isolationScopeUserId: Sentry.getIsolationScope().getUser()?.id,
    isolationScopeTag: Sentry.getIsolationScope().getScopeData().tags?.user_id,
  };
});

// Flush route for waiting on events
app.get('/flush', async () => {
  await Sentry.flush();
  return { ok: true };
});

app.listen(3030, () => {
  console.log('Elysia app listening on port 3030');
});

// Second app for external propagation tests
const app2 = new Elysia();

app2.get('/external-allowed', ({ request }) => {
  const headers = Object.fromEntries(request.headers.entries());
  return { headers, route: '/external-allowed' };
});

app2.get('/external-disallowed', ({ request }) => {
  const headers = Object.fromEntries(request.headers.entries());
  return { headers, route: '/external-disallowed' };
});

app2.listen(3040, () => {
  console.log('External app listening on port 3040');
});
