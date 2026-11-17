import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/request-context')({
  server: {
    handlers: {
      GET: async ({ context }) => {
        return Response.json({ fromServerEntry: context.fromServerEntry });
      },
    },
  },
});
