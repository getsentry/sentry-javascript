/**
 * @vitest-environment jsdom
 */
import {
  createTransport,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
} from '@sentry/core';
import { render } from '@testing-library/react';
import * as React from 'react';
import type { RouteObject } from 'react-router-6';
import {
  createMemoryRouter,
  createRoutesFromChildren,
  matchRoutes,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useNavigationType,
  useRoutes,
} from 'react-router-6';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../src';
import { allRoutes } from '../src/reactrouter-compat-utils/instrumentation';
import {
  reactRouterV6BrowserTracingIntegration,
  withSentryReactRouterV6Routing,
  wrapCreateMemoryRouterV6,
  wrapUseRoutesV6,
} from '../src/reactrouterv6';

const mockStartBrowserTracingPageLoadSpan = vi.fn();
const mockStartBrowserTracingNavigationSpan = vi.fn();

const mockRootSpan = {
  updateName: vi.fn(),
  setAttribute: vi.fn(),
  getSpanJSON() {
    return { op: 'pageload' };
  },
};

vi.mock('@sentry/browser', async requireActual => {
  const actual = (await requireActual()) as any;
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

vi.mock('@sentry/core', async requireActual => {
  return {
    ...(await requireActual()),
    getRootSpan: () => {
      return mockRootSpan;
    },
  };
});

describe('reactRouterV6BrowserTracingIntegration', () => {
  function createMockBrowserClient(): BrowserClient {
    return new BrowserClient({
      integrations: [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentScope().setClient(undefined);
    allRoutes.clear();
  });

  it('wrapCreateMemoryRouterV6 starts and updates a pageload transaction - single initialEntry', () => {
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

    const routes: RouteObject[] = [
      {
        path: '/',
        element: <div>Home</div>,
      },
      {
        path: '/about',
        element: <div>About</div>,
      },
    ];

    const wrappedCreateMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

    const router = wrappedCreateMemoryRouter(routes, {
      initialEntries: ['/about'],
    });

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

    expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/about');
  });

  it('wrapCreateMemoryRouterV6 starts and updates a pageload transaction - multiple initialEntries', () => {
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

    const routes: RouteObject[] = [
      {
        path: '/',
        element: <div>Home</div>,
      },
      {
        path: '/about',
        element: <div>About</div>,
      },
    ];

    const wrappedCreateMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

    const router = wrappedCreateMemoryRouter(routes, {
      initialEntries: ['/', '/about'],
      initialIndex: 1,
    });

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

    expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/about');
  });

  describe('withSentryReactRouterV6Routing', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/" element={<div>Home</div>} />
          </SentryRoutes>
        </MemoryRouter>,
      );

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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/" element={<div>Home</div>} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(getCurrentScope().getScopeData().transactionName).toEqual('/');
    });

    it('skips pageload transaction with `instrumentPageLoad: false`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          instrumentPageLoad: false,
        }),
      );
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/" element={<div>Home</div>} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(0);
    });

    it('skips navigation transaction, with `instrumentNavigation: false`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          instrumentNavigation: false,
        }),
      );
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>} />
            <Route path="/" element={<Navigate to="/about" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(0);
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>} />
            <Route path="/" element={<Navigate to="/about" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>}>
              <Route path="/about/us" element={<div>us</div>} />
            </Route>
            <Route path="/" element={<Navigate to="/about/us" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>}>
              <Route path="/about/:page" element={<div>page</div>} />
            </Route>
            <Route path="/" element={<Navigate to="/about/us" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/stores" element={<div>Stores</div>}>
              <Route path="/stores/:storeId" element={<div>Store</div>}>
                <Route path="/stores/:storeId/products/:productId" element={<div>Product</div>} />
              </Route>
            </Route>
            <Route path="/" element={<Navigate to="/stores/foo/products/234" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

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

    it('works with nested paths with parameters', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/projects/123/views/234" />} />
            <Route path="account" element={<div>Account Page</div>} />
            <Route path="projects">
              <Route index element={<div>Project Index</div>} />
              <Route path=":projectId" element={<div>Project Page</div>}>
                <Route index element={<div>Project Page Root</div>} />
                <Route element={<div>Editor</div>}>
                  <Route path="views/:viewId" element={<div>View Canvas</div>} />
                  <Route path="spaces/:spaceId" element={<div>Space Canvas</div>} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<div>No Match Page</div>} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with wildcard routes', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="*" element={<Outlet />}>
              <Route index element={<Navigate to="/projects/123/views/234" />} />
              <Route path="account" element={<div>Account Page</div>} />
              <Route path="projects">
                <Route path="*" element={<Outlet />}>
                  <Route path=":projectId" element={<div>Project Page</div>}>
                    <Route index element={<div>Project Page Root</div>} />
                    <Route element={<div>Editor</div>}>
                      <Route path="views/:viewId" element={<div>View Canvas</div>} />
                      <Route path="spaces/:spaceId" element={<div>Space Canvas</div>} />
                    </Route>
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<div>No Match Page</div>} />
            </Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with nested wildcard routes', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="*" element={<Outlet />}>
              <Route index element={<Navigate to="/projects/123/views/234" />} />
              <Route path="account" element={<div>Account Page</div>} />
              <Route path="projects">
                <Route path="*" element={<Outlet />}>
                  <Route path=":projectId" element={<div>Project Page</div>}>
                    <Route index element={<div>Project Page Root</div>} />
                    <Route element={<div>Editor</div>}>
                      <Route path="*" element={<Outlet />}>
                        <Route path="views/:viewId" element={<div>View Canvas</div>} />
                        <Route path="spaces/:spaceId" element={<div>Space Canvas</div>} />
                      </Route>
                    </Route>
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<div>No Match Page</div>} />
            </Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works under a slash route with a trailing slash', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/issues/123/" />} />
            <Route path="/" element={<div>root</div>}>
              <Route path="/issues/:groupId/" element={<div>issues group</div>}>
                <Route index element={<div>index</div>} />
              </Route>
            </Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/issues/:groupId/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works nested under a slash root without a trailing slash', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/issues/123" />} />
            <Route path="/" element={<div>root</div>}>
              <Route path="/issues/:groupId/" element={<div>issues group</div>}>
                <Route index element={<div>index</div>} />
              </Route>
            </Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/issues/:groupId/',
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>}>
              <Route path="/about/:page" element={<div>page</div>} />
            </Route>
            <Route path="/" element={<Navigate to="/about/us" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(getCurrentScope().getScopeData().transactionName).toBe('/about/:page');
    });
  });

  describe('wrapUseRoutesV6', () => {
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <div>Home</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <div>Home</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(getCurrentScope().getScopeData().transactionName).toEqual('/');
    });

    it('skips pageload transaction with `instrumentPageLoad: false`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          instrumentPageLoad: false,
        }),
      );

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <div>Home</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(0);
    });

    it('skips navigation transaction, with `instrumentNavigation: false`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          instrumentNavigation: false,
        }),
      );

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <Navigate to="/about" />,
          },
          {
            path: '/about',
            element: <div>About</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(0);
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <Navigate to="/about" />,
          },
          {
            path: '/about',
            element: <div>About</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <Navigate to="/about/us" />,
          },
          {
            path: '/about',
            element: <div>About</div>,
            children: [
              {
                path: '/about/us',
                element: <div>us</div>,
              },
            ],
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <Navigate to="/about/us" />,
          },
          {
            path: '/about',
            element: <div>About</div>,
            children: [
              {
                path: '/about/:page',
                element: <div>page</div>,
              },
            ],
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <Navigate to="/stores/foo/products/234" />,
          },
          {
            path: '/stores',
            element: <div>Stores</div>,
            children: [
              {
                path: '/stores/:storeId',
                element: <div>Store</div>,
                children: [
                  {
                    path: '/stores/:storeId/products/:productId',
                    element: <div>Product</div>,
                  },
                ],
              },
            ],
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

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

    it('works with nested paths with parameters', () => {
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            index: true,
            element: <Navigate to="/projects/123/views/234" />,
          },
          {
            path: 'account',
            element: <div>Account Page</div>,
          },
          {
            path: 'projects',
            children: [
              {
                index: true,
                element: <div>Project Index</div>,
              },
              {
                path: ':projectId',
                element: <div>Project Page</div>,
                children: [
                  {
                    index: true,
                    element: <div>Project Page Root</div>,
                  },
                  {
                    element: <div>Editor</div>,
                    children: [
                      {
                        path: 'views/:viewId',
                        element: <div>View Canvas</div>,
                      },
                      {
                        path: 'spaces/:spaceId',
                        element: <div>Space Canvas</div>,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: '*',
            element: <div>No Match Page</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with wildcard routes', () => {
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            index: true,
            element: <Navigate to="/param-page/1231/details/3212" />,
          },
          {
            path: '*',
            element: <></>,
            children: [
              {
                path: 'profile',
                element: <></>,
              },
              {
                path: 'param-page',
                element: <Outlet />,
                children: [
                  {
                    path: '*',
                    element: <Outlet />,
                    children: [
                      {
                        path: ':id',
                        element: <></>,
                        children: [
                          {
                            element: <></>,
                            path: 'details',
                            children: [
                              {
                                element: <></>,
                                path: ':superId',
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/param-page/:id/details/:superId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('does not add double slashes to URLS', () => {
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: (
              <div>
                <Outlet />
              </div>
            ),
            children: [
              {
                path: 'tests',
                children: [
                  { index: true, element: <div>Main Test</div> },
                  { path: ':testId/*', element: <div>Test Component</div> },
                ],
              },
              { path: '/', element: <Navigate to="/home" /> },
              { path: '*', element: <Navigate to="/404" replace /> },
            ],
          },
          {
            path: '/',
            element: <div />,
            children: [
              { path: '404', element: <div>Error</div> },
              { path: '*', element: <Navigate to="/404" replace /> },
            ],
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/tests']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      // should be /tests not //tests
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/tests');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('handles wildcard routes properly', () => {
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: (
              <div>
                <Outlet />
              </div>
            ),
            children: [
              {
                path: 'tests',
                children: [
                  { index: true, element: <div>Main Test</div> },
                  { path: ':testId/*', element: <div>Test Component</div> },
                ],
              },
              { path: '/', element: <Navigate to="/home" /> },
              { path: '*', element: <Navigate to="/404" replace /> },
            ],
          },
          {
            path: '/',
            element: <div />,
            children: [
              { path: '404', element: <div>Error</div> },
              { path: '*', element: <Navigate to="/404" replace /> },
            ],
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/tests/123']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/tests/:testId/*');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('works under a slash route with a trailing slash', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/issues/123/" />} />
            <Route path="/" element={<div>root</div>}>
              <Route path="/issues/:groupId/" element={<div>issues group</div>}>
                <Route index element={<div>index</div>} />
              </Route>
            </Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/issues/:groupId/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works nested under a slash root without a trailing slash', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/issues/123" />} />
            <Route path="/" element={<div>root</div>}>
              <Route path="/issues/:groupId/" element={<div>issues group</div>}>
                <Route index element={<div>index</div>} />
              </Route>
            </Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/issues/:groupId/',
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/',
            element: <Navigate to="/about" />,
          },
          {
            path: '/about',
            element: <div>About</div>,
          },
        ]);

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(getCurrentScope().getScopeData().transactionName).toBe('/about');
    });
  });
});
