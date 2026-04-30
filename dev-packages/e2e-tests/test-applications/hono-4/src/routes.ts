import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { failingMiddleware, middlewareA, middlewareB } from './middleware';
import { errorRoutes } from './route-groups/test-errors';
import { middlewareRoutes, subAppWithInlineMiddleware, subAppWithMiddleware } from './route-groups/test-middleware';
import { routePatterns } from './route-groups/test-route-patterns';

export function addRoutes(app: Hono<{ Bindings?: { E2E_TEST_DSN: string } }>): void {
  app.get('/', c => {
    return c.text('Hello Hono!');
  });

  app.get('/test-param/:paramId', c => {
    return c.json({ paramId: c.req.param('paramId') });
  });

  app.get('/error/async', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw new Error('Async route error');
  });

  app.get('/error/non-error-throw', () => {
    // eslint-disable-next-line no-throw-literal
    throw 'Non-Error thrown value';
  });

  app.get('/error/nested-cause', () => {
    const rootCause = new Error('Database connection failed');
    const intermediateCause = new Error('Query execution failed', { cause: rootCause });
    throw new Error('Request handler failed', { cause: intermediateCause });
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

  app.get('/redirect/301', c => {
    return c.redirect('/', 301);
  });

  app.get('/redirect/302', c => {
    return c.redirect('/', 302);
  });

  app.get('/status/400', c => {
    return c.text('Bad Request', 400);
  });

  app.get('/status/403', c => {
    return c.text('Forbidden', 403);
  });

  app.get('/status/404', c => {
    return c.text('Not Found', 404);
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

  // Inline middleware patterns: direct method, .all(), .on() with inline/separate middleware
  app.route('/test-inline-middleware', subAppWithInlineMiddleware);

  // Route patterns: HTTP methods, .all(), .on(), sync/async, errors
  app.route('/test-routes', routePatterns);

  // Error-specific routes: onError handler, nested sub-apps, middleware HTTPException
  app.route('/test-errors', errorRoutes);
}
