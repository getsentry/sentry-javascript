import { defineHandler, getQuery, setResponseHeader } from 'nitro/h3';

export default defineHandler(event => {
  setResponseHeader(event, 'x-sentry-test-middleware', 'executed');

  const query = getQuery(event);
  if (query['middleware-error'] === '1') {
    throw new Error('Middleware error');
  }
});
