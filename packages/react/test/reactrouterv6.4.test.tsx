import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  createTransport,
  getCurrentScope,
  setCurrentClient,
} from '@sentry/core';
import { render } from '@testing-library/react';
import { Request } from 'node-fetch';
import * as React from 'react';
import {
  Navigate,
  RouterProvider,
  createMemoryRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-6.4';

import { BrowserClient, wrapCreateBrowserRouter } from '../src';
import { reactRouterV6BrowserTracingIntegration } from '../src/reactrouterv6';
import type { CreateRouterFunction } from '../src/types';

beforeAll(() => {
  // @ts-expect-error need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = Request;
});

const mockStartBrowserTracingPageLoadSpan = jest.fn();
const mockStartBrowserTracingNavigationSpan = jest.fn();

const mockRootSpan = {
  updateName: jest.fn(),
  setAttribute: jest.fn(),
  getSpanJSON() {
    return { op: 'pageload' };
  },
};

jest.mock('@sentry/browser', () => {
  const actual = jest.requireActual('@sentry/browser');
  return {
    ...actual,
    startBrowserTracingNavigationSpan: (...args: unknown[]) => {
      mockStartBrowserTracingNavigationSpan(...args);
      return actual.startBrowserTracingNavigationSpan(...args);
    },
    startBrowserTracingPageLoadSpan: (...args: unknown[]) => {
      mockStartBrowserTracingPageLoadSpan(...args);
      return actual.startBrowserTracingPageLoadSpan(...args);
    },
  };
});

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    getRootSpan: () => {
      return mockRootSpan;
    },
  };
});

describe('reactRouterV6BrowserTracingIntegration (v6.4)', () => {
  function createMockBrowserClient(): BrowserClient {
    return new BrowserClient({
      integrations: [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentScope().setClient(undefined);
  });

  describe('wrapCreateBrowserRouter', () => {
    it('starts a pageload transaction', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <div>TEST</div>,
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v6',
        },
      });
    });

    it("updates the scope's `transactionName` on a pageload", () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <div>TEST</div>,
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(getCurrentScope().getScopeData()?.transactionName).toEqual('/');
    });

    it('starts a navigation transaction', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/about" />,
          },
          {
            path: 'about',
            element: <div>About</div>,
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/about',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with nested routes', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/about/us" />,
          },
          {
            path: 'about',
            element: <div>About</div>,
            children: [
              {
                path: 'us',
                element: <div>Us</div>,
              },
            ],
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/about/us',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with parameterized paths', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/about/us" />,
          },
          {
            path: 'about',
            element: <div>About</div>,
            children: [
              {
                path: ':page',
                element: <div>Page</div>,
              },
            ],
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/about/:page',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with paths with multiple parameters', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/stores/foo/products/234" />,
          },
          {
            path: 'stores',
            element: <div>Stores</div>,
            children: [
              {
                path: ':storeId',
                element: <div>Store</div>,
                children: [
                  {
                    path: 'products',
                    element: <div>Products</div>,
                    children: [
                      {
                        path: ':productId',
                        element: <div>Product</div>,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/stores/:storeId/products/:productId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('updates pageload transaction to a parameterized route', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: 'about',
            element: <div>About</div>,
            children: [
              {
                path: ':page',
                element: <div>page</div>,
              },
            ],
          },
        ],
        {
          initialEntries: ['/about/us'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/about/:page');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('works with `basename` option', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/about/us" />,
          },
          {
            path: 'about',
            element: <div>About</div>,
            children: [
              {
                path: 'us',
                element: <div>Us</div>,
              },
            ],
          },
        ],
        {
          initialEntries: ['/app'],
          basename: '/app',
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/app/about/us',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with parameterized paths and `basename`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/some-org-id/users/some-user-id" />,
          },
          {
            path: ':orgId',
            children: [
              {
                path: 'users',
                children: [
                  {
                    path: ':userId',
                    element: <div>User</div>,
                  },
                ],
              },
            ],
          },
        ],
        {
          initialEntries: ['/admin'],
          basename: '/admin',
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/admin/:orgId/users/:userId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('strips `basename` from transaction names of parameterized paths', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          stripBasename: true,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/some-org-id/users/some-user-id" />,
          },
          {
            path: ':orgId',
            children: [
              {
                path: 'users',
                children: [
                  {
                    path: ':userId',
                    element: <div>User</div>,
                  },
                ],
              },
            ],
          },
        ],
        {
          initialEntries: ['/admin'],
          basename: '/admin',
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/:orgId/users/:userId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('strips `basename` from transaction names of non-parameterized paths', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          stripBasename: true,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/about/us" />,
          },
          {
            path: 'about',
            element: <div>About</div>,
            children: [
              {
                path: 'us',
                element: <div>Us</div>,
              },
            ],
          },
        ],
        {
          initialEntries: ['/app'],
          basename: '/app',
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/about/us',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it("updates the scope's `transactionName` on a navigation", () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const sentryCreateBrowserRouter = wrapCreateBrowserRouter(createMemoryRouter as CreateRouterFunction);

      const router = sentryCreateBrowserRouter(
        [
          {
            path: '/',
            element: <Navigate to="/about" />,
          },
          {
            path: 'about',
            element: <div>About</div>,
          },
        ],
        {
          initialEntries: ['/'],
        },
      );

      // @ts-expect-error router is fine
      render(<RouterProvider router={router} />);

      expect(getCurrentScope().getScopeData()?.transactionName).toEqual('/about');
    });
  });
});
