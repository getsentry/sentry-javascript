import { createApp } from 'vue';
import { RouterProvider, createRoute, createRootRoute, createRouter } from '@tanstack/vue-router';
import * as Sentry from '@sentry/vue';
import { tanstackRouterBrowserTracingIntegration } from '@sentry/vue/tanstackrouter';

import App from './App.vue';
import HomeView from './HomeView.vue';
import PostView from './PostView.vue';

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeView,
});

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
});

const postIdRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  loader: async ({ params }) => {
    return Sentry.startSpan({ name: `loading-post-${params.postId}` }, async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
    });
  },
  component: PostView,
});

const routeTree = rootRoute.addChildren([indexRoute, postsRoute.addChildren([postIdRoute])]);

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/vue-router' {
  interface Register {
    router: typeof router;
  }
}

const app = createApp(RouterProvider, { router });

Sentry.init({
  app,
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  debug: true,
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [tanstackRouterBrowserTracingIntegration(router)],
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

app.mount('#app');
