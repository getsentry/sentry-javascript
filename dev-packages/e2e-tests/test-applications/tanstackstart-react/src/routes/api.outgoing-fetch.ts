import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/outgoing-fetch')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await fetch(new URL('/api/headers', request.url));
        return Response.json(await response.json());
      },
    },
  },
});
