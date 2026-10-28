import { createError, defineEventHandler, getHeader, setHeader, getQuery } from '#imports';

export default defineEventHandler(async event => {
  // The tunnel variant checks that the managed tunnel answers before an auth middleware like this one.
  if (process.env.E2E_TEST_TUNNEL && event.method === 'POST' && getHeader(event, 'x-auth') !== 'ok') {
    throw createError({ statusCode: 401, statusMessage: 'blocked by user auth' });
  }

  // Check if we should throw an error
  const query = getQuery(event);
  if (query.throwError === 'true') {
    throw new Error('Auth middleware error');
  }

  // Set a header to indicate this middleware ran
  setHeader(event, 'x-auth-middleware', 'executed');
});
