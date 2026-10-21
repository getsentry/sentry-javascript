import { defineEventHandler, getHeader } from '#imports';

export default defineEventHandler(async event => {
  // Simple API endpoint that will trigger all server middleware
  return {
    message: 'Server middleware test endpoint',
    path: event.path,
    method: event.method,
    headers: {
      'x-first-middleware': getHeader(event, 'x-first-middleware'),
      'x-second-middleware': getHeader(event, 'x-second-middleware'),
      'x-auth-middleware': getHeader(event, 'x-auth-middleware'),
    },
  };
});
