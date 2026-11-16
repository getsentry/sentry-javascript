import * as Sentry from '@sentry/tanstackstart-react';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const getRouter = () => {
  const router = createRouter({ routeTree });

  if (!router.isServer) {
    // No `tunnel`, so `tunnelRoute` picks it.
    Sentry.init({
      dsn: 'http://public@localhost:3031/1337',
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      tracesSampleRate: 1,
    });
  }

  return router;
};
