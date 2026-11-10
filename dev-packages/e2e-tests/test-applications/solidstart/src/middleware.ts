import { sentryBeforeResponseMiddleware } from '@sentry/solidstart';
import { createMiddleware } from '@solidjs/start/middleware';

export default createMiddleware({
  onRequest: [
    // The tunnel variant checks that the managed tunnel answers before an auth middleware like this one.
    event => {
      const request = event.request;
      if (process.env.E2E_TEST_TUNNEL && request.method === 'POST' && request.headers.get('x-auth') !== 'ok') {
        return new Response('blocked by user auth', { status: 401 });
      }
    },
  ],
  onBeforeResponse: [sentryBeforeResponseMiddleware()],
});
