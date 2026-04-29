import { Hono } from 'hono';
import { failingMiddleware, middlewareA, middlewareB } from '../middleware';

const middlewareRoutes = new Hono();

middlewareRoutes.get('/named', c => c.json({ middleware: 'named' }));
middlewareRoutes.get('/anonymous', c => c.json({ middleware: 'anonymous' }));
middlewareRoutes.get('/multi', c => c.json({ middleware: 'multi' }));
middlewareRoutes.get('/error', c => c.text('should not reach'));

// Self-contained sub-app registering its own middleware via .use()
const subAppWithMiddleware = new Hono();

subAppWithMiddleware.use('/named/*', middlewareA);
subAppWithMiddleware.use('/anonymous/*', async (c, next) => {
  c.header('X-Custom', 'anonymous');
  await next();
});
subAppWithMiddleware.use('/multi/*', middlewareA, middlewareB);
subAppWithMiddleware.use('/error/*', failingMiddleware);

// .all() handler (1 parameter) — should NOT be wrapped as middleware by patchRoute.
subAppWithMiddleware.all('/all-handler', async function allCatchAll(c) {
  return c.json({ handler: 'all' });
});

subAppWithMiddleware.route('/', middlewareRoutes);

// Sub-app with inline middleware for different registration styles.
// patchRoute wraps non-last handlers per method+path group as middleware.
const subAppWithInlineMiddleware = new Hono();

const METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

// Direct method registration for each HTTP method
METHODS.forEach(method => {
  subAppWithInlineMiddleware[method](
    '/direct',
    async function inlineMiddleware(_c, next) {
      await next();
    },
    c => c.text(`${method} direct response`),
  );

  subAppWithInlineMiddleware[method]('/direct/separately', async function inlineSeparateMiddleware(_c, next) {
    await next();
  });
  subAppWithInlineMiddleware[method]('/direct/separately', c => c.text(`${method} direct separate response`));
});

// .all(): .all('/path', mw, handler)
subAppWithInlineMiddleware.all(
  '/all',
  async function inlineMiddlewareAll(_c, next) {
    await next();
  },
  c => c.text('all response'),
);
subAppWithInlineMiddleware.all('/all/separately', async function inlineSeparateMiddlewareAll(_c, next) {
  await next();
});
subAppWithInlineMiddleware.all('/all/separately', c => c.text('all separate response'));

// .on() registration for each HTTP method
METHODS.forEach(method => {
  subAppWithInlineMiddleware.on(
    method,
    '/on',
    async function inlineMiddlewareOn(_c, next) {
      await next();
    },
    c => c.text(`${method} on response`),
  );

  subAppWithInlineMiddleware.on(method, '/on/separately', async function inlineSeparateMiddlewareOn(_c, next) {
    await next();
  });
  subAppWithInlineMiddleware.on(method, '/on/separately', c => c.text(`${method} on separate response`));
});

export { middlewareRoutes, subAppWithMiddleware, subAppWithInlineMiddleware };
