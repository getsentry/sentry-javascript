import { Link, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from '@tanstack/solid-router';
import * as Sentry from '@sentry/solid';
import { tanstackRouterBrowserTracingIntegration } from '@sentry/solid/tanstackrouter';
import { render } from 'solid-js/web';

import './styles.css';

import App from './App.tsx';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/posts/$postId" params={{ postId: '1' }}>
            Post 1
          </Link>
        </li>
        <li>
          <Link to="/posts/$postId" params={{ postId: '2' }} id="nav-link">
            Post 2
          </Link>
        </li>
      </ul>
      <hr />
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
});

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
});

const postIdRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  shouldReload() {
    return true;
  },
  loader: ({ params }) => {
    return Sentry.startSpan({ name: `loading-post-${params.postId}` }, async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
    });
  },
  component: function Post() {
    const params = postIdRoute.useParams();
    return <div>Post ID: {params().postId}</div>;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, postsRoute.addChildren([postIdRoute])]);

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router;
  }
}

declare const __APP_DSN__: string;

Sentry.init({
  dsn: __APP_DSN__,
  debug: true,
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [tanstackRouterBrowserTracingIntegration(router)],
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

function MainApp() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

const rootElement = document.getElementById('app');
if (rootElement) {
  render(() => <MainApp />, rootElement);
}
