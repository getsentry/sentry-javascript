import { defineEventHandler } from 'nuxt/server';

export default defineEventHandler(event => {
  return {
    message: 'Server middleware test endpoint',
    path: event.url.pathname,
    method: event.req.method,
  };
});
