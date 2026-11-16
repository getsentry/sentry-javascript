import * as Sentry from '@sentry/solidstart';
import { createMiddleware } from '@solidjs/start/middleware';

export default createMiddleware({
  onRequest: ({ request }) => {
    if (request.method === 'POST') {
      return new Response('blocked by user auth', { status: 401 });
    }

    // SolidStart 1 matches API routes without `server.baseURL` and captures none of their errors, so the routes
    // the tunnel suite requests live here.
    const { pathname } = new URL(request.url);
    if (pathname === '/app/api/anchor') {
      return new Response('ok');
    }
    if (pathname === '/app/api/error') {
      Sentry.captureException(new Error('Tunnel test error'));
      return new Response(null, { status: 500 });
    }
  },
});
