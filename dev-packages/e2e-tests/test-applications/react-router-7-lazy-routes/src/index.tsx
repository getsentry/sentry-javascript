import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  PatchRoutesOnNavigationFunction,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import Index from './pages/Index';
import Deep from './pages/Deep';

function getRuntimeConfig(): { lazyRouteTimeout?: number; idleTimeout?: number } {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const url = new URL(window.location.href);
    const timeoutParam = url.searchParams.get('timeout');
    const idleTimeoutParam = url.searchParams.get('idleTimeout');

    let lazyRouteTimeout: number | undefined = undefined;
    if (timeoutParam) {
      if (timeoutParam === 'Infinity') {
        lazyRouteTimeout = Infinity;
      } else {
        const parsed = parseInt(timeoutParam, 10);
        if (!isNaN(parsed)) {
          lazyRouteTimeout = parsed;
        }
      }
    }

    let idleTimeout: number | undefined = undefined;
    if (idleTimeoutParam) {
      const parsed = parseInt(idleTimeoutParam, 10);
      if (!isNaN(parsed)) {
        idleTimeout = parsed;
      }
    }

    return {
      lazyRouteTimeout,
      idleTimeout,
    };
  } catch (error) {
    console.warn('Failed to read runtime config, falling back to defaults', error);
    return {};
  }
}

const runtimeConfig = getRuntimeConfig();

// Static manifest for transaction naming when lazy routes are enabled
const lazyRouteManifest = [
  '/',
  '/static',
  '/delayed-lazy/:id',
  '/lazy/inner',
  '/lazy/inner/:id',
  '/lazy/inner/:id/:anotherId',
  '/lazy/inner/:id/:anotherId/:someAnotherId',
  '/another-lazy/sub',
  '/another-lazy/sub/:id',
  '/another-lazy/sub/:id/:subId',
  '/long-running/slow',
  '/long-running/slow/:id',
  '/deep/level2',
  '/deep/level2/level3/:id',
  '/slow-fetch/:id',
  '/wildcard-lazy/:id',
];

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.REACT_APP_E2E_TEST_DSN,
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
      trackFetchStreamPerformance: true,
      enableAsyncRouteHandlers: true,
      lazyRouteTimeout: runtimeConfig.lazyRouteTimeout,
      idleTimeout: runtimeConfig.idleTimeout,
      lazyRouteManifest,
    }),
  ],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',

  tunnel: 'http://localhost:3031',
});

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter);

const router = sentryCreateBrowserRouter(
  [
    {
      path: '/',
      element: <Index />,
    },
    {
      path: '/lazy',
      handle: {
        lazyChildren: () => import('./pages/InnerLazyRoutes').then(module => module.someMoreNestedRoutes),
      },
    },
    {
      path: '/another-lazy',
      handle: {
        lazyChildren: () => import('./pages/AnotherLazyRoutes').then(module => module.anotherNestedRoutes),
      },
    },
    {
      path: '/long-running',
      handle: {
        lazyChildren: () => import('./pages/LongRunningLazyRoutes').then(module => module.longRunningNestedRoutes),
      },
    },
    {
      path: '/static',
      element: <>Hello World</>,
    },
    {
      path: '/delayed-lazy/:id',
      lazy: async () => {
        // Simulate slow lazy route loading (400ms delay)
        await new Promise(resolve => setTimeout(resolve, 400));
        return {
          Component: (await import('./pages/DelayedLazyRoute')).default,
        };
      },
    },
    {
      path: '/deep',
      element: <Deep />,
      handle: {
        lazyChildren: () => import('./pages/deep/Level1Routes').then(module => module.level2Routes),
      },
    },
    {
      path: '/slow-fetch',
      handle: {
        // This lazy handler takes 500ms due to the top-level await in SlowFetchLazyRoutes.tsx
        // It also makes a fetch request during loading which creates a span
        lazyChildren: () => import('./pages/SlowFetchLazyRoutes').then(module => module.slowFetchRoutes),
      },
    },
    {
      // Route with wildcard placeholder that gets replaced by lazy-loaded parameterized routes
      // This tests that wildcard transaction names get upgraded to parameterized routes
      path: '/wildcard-lazy',
      children: [
        {
          path: '*', // Catch-all wildcard - will be matched initially before lazy routes load
          element: <>Loading...</>,
        },
      ],
      handle: {
        lazyChildren: () => import('./pages/WildcardLazyRoutes').then(module => module.wildcardRoutes),
      },
    },
  ],
  {
    async patchRoutesOnNavigation({ matches, patch }: Parameters<PatchRoutesOnNavigationFunction>[0]) {
      const leafRoute = matches[matches.length - 1]?.route;
      if (leafRoute?.id && leafRoute?.handle?.lazyChildren) {
        const children = await leafRoute.handle.lazyChildren();
        patch(leafRoute.id, children);
      }
    },
  },
);

// E2E TEST UTILITY: Expose router instance for canary tests
// This allows tests to verify React Router's route exposure behavior.
// See tests/react-router-manifest.test.ts for usage.
declare global {
  interface Window {
    __REACT_ROUTER__: typeof router;
  }
}
window.__REACT_ROUTER__ = router;

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<RouterProvider router={router} />);
