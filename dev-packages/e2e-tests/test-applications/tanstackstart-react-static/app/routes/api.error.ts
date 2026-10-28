import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/error')({
  server: {
    handlers: {
      GET: async () => {
        throw new Error('Sentry API Route Test Error');
      },
    },
  },
});
