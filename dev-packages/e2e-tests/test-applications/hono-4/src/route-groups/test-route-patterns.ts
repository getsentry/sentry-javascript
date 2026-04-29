import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

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

// .all() registration
routePatterns.all('/all', c => c.text('all handler response'));

// .on() registration
METHODS.forEach(method => {
  routePatterns.on(method, '/on', c => c.text(`${method} on response`));
});

// Error routes for direct method registration
METHODS.forEach(method => {
  routePatterns[method]('/500', () => {
    throw new HTTPException(500, { message: 'response 500' });
  });
  routePatterns[method]('/401', () => {
    throw new HTTPException(401, { message: 'response 401' });
  });
  routePatterns[method]('/402', () => {
    throw new HTTPException(402, { message: 'response 402' });
  });
  routePatterns[method]('/403', () => {
    throw new HTTPException(403, { message: 'response 403' });
  });
});

// Error routes for .all()
routePatterns.all('/all/500', () => {
  throw new HTTPException(500, { message: 'response 500' });
});

// Error routes for .on()
METHODS.forEach(method => {
  routePatterns.on(method, '/on/500', () => {
    throw new HTTPException(500, { message: 'response 500' });
  });
});

export { routePatterns };
