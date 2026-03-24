import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';

export default defineHandler(async event => {
  // Check if we should throw an error
  const query = getQuery(event);
  if (query.throwError === 'true') {
    throw new Error('Auth middleware error');
  }

  // Set a header to indicate this middleware ran
  event.res?.headers.set('x-auth-middleware', 'executed');
});
