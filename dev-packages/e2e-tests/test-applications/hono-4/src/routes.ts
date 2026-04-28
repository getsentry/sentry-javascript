import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { failingMiddleware, middlewareA, middlewareB } from './middleware';
import { middlewareRoutes, subAppWithMiddleware } from './route-groups/test-middleware';

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

  // Root-app middleware: registered on the patched main app instance
  app.use('/test-middleware/named/*', middlewareA);
  app.use('/test-middleware/anonymous/*', async (c, next) => {
    c.header('X-Custom', 'anonymous');
    await next();
  });
  app.use('/test-middleware/multi/*', middlewareA, middlewareB);
  app.use('/test-middleware/error/*', failingMiddleware);
  app.route('/test-middleware', middlewareRoutes);

  // Sub-app middleware: registered on the sub-app, wrapped at mount time by route() patching
  app.route('/test-subapp-middleware', subAppWithMiddleware);
}
