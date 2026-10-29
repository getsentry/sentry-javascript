import { defineHandler, getQuery, HTTPError, setResponseHeader } from 'nitro/h3';

export default defineHandler(event => {
  // The tunnel variant checks that the managed tunnel answers before an auth middleware like this one.
  if (process.env.E2E_TEST_TUNNEL && event.req.method === 'POST' && event.req.headers.get('x-auth') !== 'ok') {
    throw new HTTPError({ status: 401, statusText: 'blocked by user auth' });
  }

  setResponseHeader(event, 'x-sentry-test-middleware', 'executed');

  const query = getQuery(event);
  if (query['middleware-error'] === '1') {
    throw new Error('Middleware error');
  }
});
