import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/outgoing-fetch')({
  server: {
    handlers: {
      GET: async () => {
        const response = await fetch('http://localhost:3040/');
        return Response.json({ status: response.status });
      },
    },
  },
});
