import { createFileRoute } from '@tanstack/react-router';
import { serverRouteRequestMiddleware } from '../middleware';

export const Route = createFileRoute('/api/test-middleware')({
  server: {
    middleware: [serverRouteRequestMiddleware],
    handlers: {
      GET: async () => {
        return { message: 'Server route middleware test' };
      },
    },
  },
});
