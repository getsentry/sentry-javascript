import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/headers')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return Response.json({
          sentryTrace: request.headers.get('sentry-trace'),
          baggage: request.headers.get('baggage'),
        });
      },
    },
  },
});
