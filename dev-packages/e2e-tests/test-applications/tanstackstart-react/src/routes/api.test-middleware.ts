import { createFileRoute } from '@tanstack/react-router';
import { wrappedServerRouteRequestMiddleware } from '../middleware';

export const Route = createFileRoute('/api/test-middleware')({
  server: {
    middleware: [wrappedServerRouteRequestMiddleware],
    handlers: {
      GET: async () => {
        return { message: 'Server route middleware test' };
      },
    },
  },
});
