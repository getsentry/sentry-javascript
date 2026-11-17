import { createError, defineEventHandler, getHeader } from '#imports';

export default defineEventHandler(event => {
  if (event.method === 'POST' && getHeader(event, 'x-auth') !== 'ok') {
    throw createError({ statusCode: 401, statusMessage: 'blocked by user auth' });
  }
});
