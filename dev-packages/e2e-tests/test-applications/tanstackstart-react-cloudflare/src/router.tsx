import * as Sentry from '@sentry/browser';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  if (!router.isServer) {
    Sentry.init({
      environment: 'qa',
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 1.0,
      release: 'e2e-test',
      tunnel: 'http://localhost:3031/',
    });
  }

  return router;
};
