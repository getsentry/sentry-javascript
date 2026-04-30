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

subAppWithOnError.onError((err, c) => {
  return c.text(`Handled by onError: ${err.message}`, 500);
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

childApp.get('/deep/error', () => {
  throw new Error('Deeply nested child app error');
});

const parentApp = new Hono();
parentApp.route('/child', childApp);

errorRoutes.route('/nested', parentApp);

// Route that throws after partial response setup
errorRoutes.get('/partial-response-error', c => {
  c.header('X-Custom-Header', 'partial');
  c.status(200);
  throw new Error('Error after partial response setup');
});

export { errorRoutes };
