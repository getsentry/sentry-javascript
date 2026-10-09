import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/files/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return new Response(JSON.stringify({ path: params._splat }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});
