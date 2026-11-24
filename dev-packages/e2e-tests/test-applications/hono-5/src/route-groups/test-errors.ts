import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const errorRoutes = new Hono();

// Middleware that throws a 5xx HTTPException (should be captured)
errorRoutes.use('/middleware-http-exception/*', async (_c, _next) => {
  throw new HTTPException(503, { message: 'Service Unavailable from middleware' });
});

errorRoutes.get('/middleware-http-exception', c => c.text('should not reach'));

// Middleware that throws a 4xx HTTPException (should NOT be captured)
errorRoutes.use('/middleware-http-exception-4xx/*', async (_c, _next) => {
  throw new HTTPException(401, { message: 'Unauthorized from middleware' });
});

errorRoutes.get('/middleware-http-exception-4xx', c => c.text('should not reach'));

// Sub-app with a custom onError handler that swallows errors
const subAppWithOnError = new Hono();

// In Hono 5, `onError` handlers are middleware: they read the error from `c.error`.
subAppWithOnError.onError(c => {
  return c.text(`Handled by onError: ${c.error?.message}`, 500);
});

subAppWithOnError.get('/fail', () => {
  throw new Error('Error caught by custom onError');
});

errorRoutes.route('/custom-on-error', subAppWithOnError);

// Nested sub-apps: parent mounts child, child route throws
const childApp = new Hono();

childApp.get('/error', () => {
  throw new Error('Nested child app error');
});

const parentApp = new Hono();
parentApp.route('/child', childApp);

errorRoutes.route('/nested', parentApp);

// Hono 5 wraps a thrown non-Error in an `Error`. The SDK must report the thrown value, not the wrapper.
errorRoutes.get('/throw-string', () => {
  throw 'Thrown string from route';
});

errorRoutes.get('/throw-object', () => {
  throw { reason: 'Thrown object from route' };
});

errorRoutes.get('/throw-object-404', () => {
  throw { status: 404, reason: 'Thrown 404 object from route' };
});

export { errorRoutes };
