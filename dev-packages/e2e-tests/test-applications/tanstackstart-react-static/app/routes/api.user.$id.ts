import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/user/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return new Response(JSON.stringify({ id: params.id }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});
