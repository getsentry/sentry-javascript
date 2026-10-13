import { Hono } from 'hono';

const routePatterns = new Hono();

const METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

// Direct method registration for each HTTP method (sync handlers)
METHODS.forEach(method => {
  routePatterns[method]('/', c => c.text(`${method} response`));
});

// Async handler
routePatterns.get('/async', async c => {
  await new Promise(resolve => setTimeout(resolve, 10));
  return c.text('async response');
});

// Dedicated route for query_string test to avoid transaction name collisions
routePatterns.get('/query-test', c => c.text('query test response'));

// Dedicated route for request data extraction tests to avoid transaction name collisions
routePatterns.get('/request-data', c => c.text('request data response'));
routePatterns.post('/request-data', c => c.text('request data response'));

// .all() registration
routePatterns.all('/all', c => c.text('all handler response'));

// .on() registration
METHODS.forEach(method => {
  routePatterns.on(method, '/on', c => c.text(`${method} on response`));
});

export { routePatterns };
