import { sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react';
import { createMiddleware, createStart } from '@tanstack/react-start';

// Stands in for the app's auth, which a managed tunnel has to be answered before. A custom tunnel route is an app
// route, so the app has to let it through itself.
const authMiddleware = createMiddleware().server(({ request, next }) =>
  request.method === 'POST' && new URL(request.url).pathname !== '/app/custom-monitor'
    ? new Response('blocked by user auth', { status: 401 })
    : next(),
);

export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, authMiddleware],
}));
