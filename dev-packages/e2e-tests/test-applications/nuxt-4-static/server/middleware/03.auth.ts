import { defineEventHandler, setHeader, getQuery } from '#imports';

export default defineEventHandler(async event => {
  // Check if we should throw an error
  const query = getQuery(event);
  if (query.throwError === 'true') {
    throw new Error('Auth middleware error');
  }

  // Set a header to indicate this middleware ran
  setHeader(event, 'x-auth-middleware', 'executed');
});
