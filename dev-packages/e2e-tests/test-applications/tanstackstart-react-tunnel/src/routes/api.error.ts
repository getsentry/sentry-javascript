import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/error')({
  server: {
    handlers: {
      GET: () => {
        throw new Error('Tunnel test error');
      },
    },
  },
});
