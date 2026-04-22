import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function addRoutes(app: Hono<{ Bindings?: { E2E_TEST_DSN: string } }>): void {
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
    // oxlint-disable-next-line typescript/no-explicit-any
    const code = Number(c.req.param('code')) as any;
    throw new HTTPException(code, { message: `HTTPException ${code}` });
  });
}
