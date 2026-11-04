import { defineEventHandler } from 'nuxt/server';

export default defineEventHandler(event => {
  event.res.headers.set('x-nuxt-server-first-middleware', 'executed');
});
