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
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      // We recommend adjusting this value in production, or using tracesSampler
      // for finer control
      tracesSampleRate: 1.0,
      release: 'e2e-test',
      tunnel: 'http://localhost:3031/', // proxy server
    });
  }

  return router;
};
