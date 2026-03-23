import { defineHandler } from 'nitro';

export default defineHandler(async event => {
  // Simple API endpoint that will trigger all server middleware
  return {
    message: 'Server middleware test endpoint',
    path: event.path,
    method: event.method,
    headers: {
      'x-first-middleware': event.req.headers.get('x-first-middleware'),
      'x-second-middleware': event.req.headers.get('x-second-middleware'),
      'x-auth-middleware': event.req.headers.get('x-auth-middleware'),
    },
  };
});
