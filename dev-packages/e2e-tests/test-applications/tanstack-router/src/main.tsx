import * as Sentry from '@sentry/react';
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
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
        <li>
          <Link to="/redirect" id="redirect-link">
            Redirect
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
  beforeLoad: ({ params }) => {
    if (params.postId === '999') {
      throw redirect({ to: '/posts/$postId', params: { postId: '2' }, replace: true });
    }
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

const redirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'redirect',
  beforeLoad: () => {
    throw redirect({ to: '/posts/$postId', params: { postId: '1' }, replace: true });
  },
});

// Dynamic enough to absorb basepath segments if they ever leak into route matching (see #23253).
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$a/$b/$c',
  component: function CatchAll() {
    return <div>Catch all</div>;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  redirectRoute,
  catchAllRoute,
  postsRoute.addChildren([postIdRoute]),
]);

declare const __APP_BASEPATH__: string;

const router = createRouter({ routeTree, ...(__APP_BASEPATH__ ? { basepath: __APP_BASEPATH__ } : {}) });

declare const __APP_DSN__: string;

Sentry.init({
  traceLifecycle: 'static',
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
