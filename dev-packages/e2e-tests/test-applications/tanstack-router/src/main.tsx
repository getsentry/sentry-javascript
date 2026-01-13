import * as Sentry from '@sentry/react';
import { Link, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

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
  component: function Index() {
    return (
      <div>
        <h3>Welcome Home!</h3>
      </div>
    );
  },
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
    const { postId } = postIdRoute.useParams();
    return <div>Post ID: {postId}</div>;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, postsRoute.addChildren([postIdRoute])]);

const router = createRouter({ routeTree });

declare const __APP_DSN__: string;

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: __APP_DSN__,
  integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server

  // Always capture replays, so we can test this properly
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
