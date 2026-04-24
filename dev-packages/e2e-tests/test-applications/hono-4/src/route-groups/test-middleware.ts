import { Hono } from 'hono';
import { failingMiddleware, middlewareA, middlewareB } from '../middleware';

const middlewareRoutes = new Hono();

middlewareRoutes.get('/named', c => c.json({ middleware: 'named' }));
middlewareRoutes.get('/anonymous', c => c.json({ middleware: 'anonymous' }));
middlewareRoutes.get('/multi', c => c.json({ middleware: 'multi' }));
middlewareRoutes.get('/error', c => c.text('should not reach'));

// Self-contained sub-app registering its own middleware
const subAppWithMiddleware = new Hono();

subAppWithMiddleware.use('/named/*', middlewareA);
subAppWithMiddleware.use('/anonymous/*', async (c, next) => {
  c.header('X-Custom', 'anonymous');
  await next();
});
subAppWithMiddleware.use('/multi/*', middlewareA, middlewareB);
subAppWithMiddleware.use('/error/*', failingMiddleware);

// .all() produces the same method:'ALL' as .use() in Hono's route record.
// Wrapping it is harmless (onlyIfParent:true) — this route exists to prove that.
subAppWithMiddleware.all('/all-handler', async function allCatchAll(c) {
  return c.json({ handler: 'all' });
});

subAppWithMiddleware.route('/', middlewareRoutes);

export { middlewareRoutes, subAppWithMiddleware };
