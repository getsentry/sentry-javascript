import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/error')({
  server: {
    handlers: {
      GET: async () => {
        try {
          throw new Error('Sentry API Route Test Error');
        } catch (error) {
          Sentry.captureException(error);
          throw error;
        }
      },
    },
  },
});
