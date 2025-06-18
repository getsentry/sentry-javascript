import { Hono } from 'hono';
import { DurableObject } from 'cloudflare:workers';
import * as Sentry from '@sentry/cloudflare';

const app = new Hono();

app.get('/', ctx => {
  return ctx.json({ message: 'Welcome to Hono API' });
});

app.get('/hello/:name', ctx => {
  const name = ctx.req.param('name');
  return ctx.json({ message: `Hello, ${name}!` });
});

app.get('/error', () => {
  throw new Error('This is a test error');
});

app.onError((err, ctx) => {
  console.error(`Error occured: ${err.message}`);
  return ctx.json({ error: err.message }, 500);
});

app.notFound(ctx => {
  return ctx.json({ message: 'Not Found' }, 404);
});

class MyDurableObjectBase extends DurableObject<Env> {
  // impl
}

// Typecheck that the instrumented durable object is valid
export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env?.E2E_TEST_DSN,
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env?.E2E_TEST_DSN,
    tracesSampleRate: 1.0,
  }),
  app,
);
