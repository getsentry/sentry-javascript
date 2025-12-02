import * as Sentry from "@sentry/tanstackstart-react"
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  console.log('CREATING ROUTER');
  console.log('E2E_TEST_DSN', process.env.E2E_TEST_DSN);
  console.log('ROUTER IS SERVER', router.isServer);

  if (!router.isServer) {
    console.log('INITIALIZING SENTRY CLIENT');
    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      debug: true,
      dsn: process.env.E2E_TEST_DSN,
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      // We recommend adjusting this value in production, or using tracesSampler
      // for finer control
      tracesSampleRate: 1.0,
      release: 'e2e-test',
      tunnel: 'http://localhost:3031/', // proxy server
    });
  }

  return router;
}
