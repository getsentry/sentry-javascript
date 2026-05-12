import * as Sentry from '@sentry/tanstackstart-react';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  if (!router.isServer) {
    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      dsn: __APP_DSN__,
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      // We recommend adjusting this value in production, or using tracesSampler
      // for finer control
      tracesSampleRate: 1.0,
      release: 'e2e-test',
      tunnel: __APP_TUNNEL__,
    });
  }

  return router;
};
