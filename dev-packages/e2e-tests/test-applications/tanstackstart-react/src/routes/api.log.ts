import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/log')({
  server: {
    handlers: {
      GET: async () => {
        Sentry.logger.info('tanstackstart-react server log', { 'e2e.attr': 'value' });
        return Response.json({ status: 'ok' });
      },
    },
  },
});
