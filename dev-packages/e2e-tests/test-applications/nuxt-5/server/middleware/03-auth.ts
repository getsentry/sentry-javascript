import { defineHandler } from 'nitro';
import { getQuery, HTTPError } from 'nitro/h3';

export default defineHandler(async event => {
  // The tunnel variant checks that the managed tunnel answers before an auth middleware like this one.
  if (process.env.E2E_TEST_TUNNEL && event.req.method === 'POST' && event.req.headers.get('x-auth') !== 'ok') {
    throw new HTTPError({ status: 401, statusText: 'blocked by user auth' });
  }

  // Check if we should throw an error
  const query = getQuery(event);
  if (query.throwError === 'true') {
    throw new Error('Auth middleware error');
  }

  // Set a header to indicate this middleware ran
  event.res?.headers.set('x-auth-middleware', 'executed');
});
