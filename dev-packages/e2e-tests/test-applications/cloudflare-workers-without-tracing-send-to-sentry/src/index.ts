import * as Sentry from '@sentry/cloudflare';

export default {
  async fetch(request) {
    switch (new URL(request.url).pathname) {
      case '/test-error': {
        const eventId = Sentry.captureException(new Error('E2E test error in a Cloudflare trace'));
        // Workers Logs store the `cf-ray` of the request with the invocation, so the test finds the Cloudflare trace
        // with it.
        return Response.json({ eventId, rayId: request.headers.get('cf-ray') });
      }
      default:
        return new Response('Hello World!');
    }
  },
} satisfies ExportedHandler<Env>;
