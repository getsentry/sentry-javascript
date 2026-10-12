import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ request }) => {
  return Response.json({
    sentryTrace: request.headers.get('sentry-trace'),
    baggage: request.headers.get('baggage'),
  });
};
