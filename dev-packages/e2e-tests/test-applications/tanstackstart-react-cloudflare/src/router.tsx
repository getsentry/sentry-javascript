import * as Sentry from '@sentry/browser';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  if (!router.isServer) {
    Sentry.addIntegration(Sentry.browserTracingIntegration());
  }

  return router;
};
