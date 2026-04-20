import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sentry } from '@sentry/hono/cloudflare';

const app = new Hono<{ Bindings: { E2E_TEST_DSN: string } }>();

app.use(
  sentry(app, env => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
  })),
);

app.get('/', c => {
  return c.text('Hello Hono!');
});

app.get('/test-param/:paramId', c => {
  return c.json({ paramId: c.req.param('paramId') });
});

app.get('/error/:cause', c => {
  throw new Error('This is a test error for Sentry!', {
    cause: c.req.param('cause'),
  });
});

app.get('/http-exception/:code', c => {
  const code = Number(c.req.param('code')) as Parameters<typeof HTTPException>[0];
  throw new HTTPException(code, { message: `HTTPException ${code}` });
});

export default app;
