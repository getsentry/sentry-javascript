import { createFileRoute } from '@tanstack/react-router';
import { flush } from '@sentry/tanstackstart-react';

export const Route = createFileRoute('/api/flush')({
  server: {
    handlers: {
      GET: async () => {
        await flush();
        return new Response('ok');
      },
    },
  },
});
