import { defineEventHandler, getQuery } from 'nuxt/server';

export default defineEventHandler(event => {
  if (getQuery(event).throwNuxtServerError === 'true') {
    throw new Error('nuxt/server auth middleware error');
  }

  event.res.headers.set('x-nuxt-server-auth-middleware', 'executed');
});
