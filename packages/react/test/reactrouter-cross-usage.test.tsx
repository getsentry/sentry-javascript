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
import { act, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import {
  createMemoryRouter,
  createRoutesFromChildren,
  matchRoutes,
  MemoryRouter,
  Navigate,
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

const mockNavigationSpan = { updateName: vi.fn(), setAttribute: vi.fn() };

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

vi.mock('@sentry/core', async requireActual => {
  const actual = (await requireActual()) as any;
  return {
    ...actual,
    getRootSpan: () => {
      return mockRootSpan;
    },
    getActiveSpan: () => {
      const span = actual.getActiveSpan();

      span.updateName = mockNavigationSpan.updateName;
      span.setAttribute = mockNavigationSpan.setAttribute;

      return span;
    },
  };
});

describe('React Router cross usage of wrappers', () => {
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

  describe('wrapCreateBrowserRouter and wrapUseRoutes', () => {
    it('works with descendant wildcard routes - pageload', () => {
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
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: '/', element: <div /> },
          { path: ':id', element: <ThirdLevel /> },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'third-level/*', element: <ThirdLevelRoutes /> },
          { path: '/', element: <div /> },
          { path: '*', element: <div /> },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'second-level/:id/*', element: <SecondLevelRoutes /> },
          { path: '/', element: <div /> },
          { path: '*', element: <div /> },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter([{ children: [{ path: '/*', element: <TopLevelRoutes /> }] }], {
        initialEntries: ['/second-level/321/third-level/123'],
      });

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');
      expect(mockRootSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('works with descendant wildcard routes - navigation', () => {
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
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: '/', element: <div /> },
          { path: ':id', element: <ThirdLevel /> },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'third-level/*', element: <ThirdLevelRoutes /> },
          { path: '/', element: <div /> },
          { path: '*', element: <div /> },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'second-level/:id/*', element: <SecondLevelRoutes /> },
          { path: '*', element: <div /> },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              { path: '/*', element: <TopLevelRoutes /> },
              { path: '/navigate', element: <Navigate to="/second-level/321/third-level/123" /> },
            ],
          },
        ],
        { initialEntries: ['/navigate'] },
      );

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      // In cross-usage scenarios, the first wrapper creates the span and the second updates it
      expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/second-level/:id/third-level/:id');
      expect(mockNavigationSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });
  });

  describe('withSentryReactRouterRouting and wrapUseRoutes', () => {
    it('works with descendant wildcard routes - pageload', () => {
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
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: '/', element: <div /> },
          { path: ':id', element: <ThirdLevel /> },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'third-level/*', element: <ThirdLevelRoutes /> },
          { path: '/', element: <div /> },
          { path: '*', element: <div /> },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'second-level/:id/*', element: <SecondLevelRoutes /> },
          { path: '/', element: <div /> },
          { path: '*', element: <div /> },
        ]);

      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const { container } = render(
        <React.StrictMode>
          <MemoryRouter initialEntries={['/second-level/321/third-level/123']}>
            <SentryRoutes>
              <Route path="/*" element={<TopLevelRoutes />} />
            </SentryRoutes>
          </MemoryRouter>
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');
      expect(mockRootSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('works with descendant wildcard routes - navigation', () => {
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
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: '/', element: <div /> },
          { path: ':id', element: <ThirdLevel /> },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'third-level/*', element: <ThirdLevelRoutes /> },
          { path: '/', element: <div /> },
          { path: '*', element: <div /> },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'second-level/:id/*', element: <SecondLevelRoutes /> },
          { path: '*', element: <div /> },
        ]);

      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const { container } = render(
        <React.StrictMode>
          <MemoryRouter initialEntries={['/navigate']}>
            <SentryRoutes>
              <Route path="/*" element={<TopLevelRoutes />} />
              <Route path="/navigate" element={<Navigate to="/second-level/321/third-level/123" />} />
            </SentryRoutes>
          </MemoryRouter>
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    });
  });

  describe('withSentryReactRouterRouting and wrapCreateBrowserRouter', () => {
    it('works with descendant wildcard routes - pageload', () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="/" element={<div />} />
          <Route path=":id" element={<ThirdLevel />} />
        </SentryRoutes>
      );

      const SecondLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="third-level/*" element={<ThirdLevelRoutes />} />
          <Route path="/" element={<div />} />
          <Route path="*" element={<div />} />
        </SentryRoutes>
      );

      const TopLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="second-level/:id/*" element={<SecondLevelRoutes />} />
          <Route path="/" element={<div />} />
          <Route path="*" element={<div />} />
        </SentryRoutes>
      );

      const router = createSentryMemoryRouter([{ children: [{ path: '/*', element: <TopLevelRoutes /> }] }], {
        initialEntries: ['/second-level/321/third-level/123'],
      });

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');
      expect(mockRootSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('works with descendant wildcard routes - navigation', () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="/" element={<div />} />
          <Route path=":id" element={<ThirdLevel />} />
        </SentryRoutes>
      );

      const SecondLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="third-level/*" element={<ThirdLevelRoutes />} />
          <Route path="/" element={<div />} />
          <Route path="*" element={<div />} />
        </SentryRoutes>
      );

      const TopLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="second-level/:id/*" element={<SecondLevelRoutes />} />
          <Route path="*" element={<div />} />
        </SentryRoutes>
      );

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              { path: '/*', element: <TopLevelRoutes /> },
              { path: '/navigate', element: <Navigate to="/second-level/321/third-level/123" /> },
            ],
          },
        ],
        { initialEntries: ['/navigate'] },
      );

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // Cross-usage deduplication: Span created once with initial route name
      // With nested lazy routes, initial name may be raw path, updated to parameterized by later wrapper
      expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/second-level/:id/third-level/:id');
      expect(mockNavigationSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });
  });

  describe('withSentryReactRouterRouting and wrapUseRoutes and wrapCreateBrowserRouter', () => {
    it('works with descendant wildcard routes - pageload', () => {
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
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: '/', element: <div /> },
          { path: ':id', element: <ThirdLevel /> },
        ]);

      const SecondLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="third-level/*" element={<ThirdLevelRoutes />} />
          <Route path="/" element={<div />} />
          <Route path="*" element={<div />} />
        </SentryRoutes>
      );

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'second-level/:id/*', element: <SecondLevelRoutes /> },
          { path: '*', element: <div /> },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter([{ children: [{ path: '/*', element: <TopLevelRoutes /> }] }], {
        initialEntries: ['/second-level/321/third-level/123'],
      });

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');
      expect(mockRootSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('works with descendant wildcard routes - navigation', () => {
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
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const ThirdLevel = () => <div>Details</div>;

      const ThirdLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: '/', element: <div /> },
          { path: ':id', element: <ThirdLevel /> },
        ]);

      const SecondLevelRoutes: React.FC = () => (
        <SentryRoutes>
          <Route path="third-level/*" element={<ThirdLevelRoutes />} />
          <Route path="/" element={<div />} />
          <Route path="*" element={<div />} />
        </SentryRoutes>
      );

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          { path: 'second-level/:id/*', element: <SecondLevelRoutes /> },
          { path: '*', element: <div /> },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              { path: '/*', element: <TopLevelRoutes /> },
              { path: '/navigate', element: <Navigate to="/second-level/321/third-level/123" /> },
            ],
          },
        ],
        { initialEntries: ['/navigate'] },
      );

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      // Cross-usage with all three wrappers: span created once, then updated
      expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/second-level/:id/third-level/:id');
      expect(mockNavigationSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });
  });

  describe('consecutive navigations to different routes', () => {
    it('should create separate transactions for consecutive navigations to different routes', async () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              { path: '/users', element: <div>Users</div> },
              { path: '/settings', element: <div>Settings</div> },
              { path: '/profile', element: <div>Profile</div> },
            ],
          },
        ],
        { initialEntries: ['/users'] },
      );

      render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(mockStartBrowserTracingNavigationSpan).not.toHaveBeenCalled();

      await act(async () => {
        router.navigate('/settings');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1));
      });

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/settings',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });

      await act(async () => {
        router.navigate('/profile');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2));
      });

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);

      const calls = mockStartBrowserTracingNavigationSpan.mock.calls;
      expect(calls[0]![1].name).toBe('/settings');
      expect(calls[1]![1].name).toBe('/profile');
      expect(calls[0]![1].attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('navigation');
      expect(calls[1]![1].attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('navigation');
    });

    it('should create separate transactions for rapid consecutive navigations', async () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              { path: '/a', element: <div>A</div> },
              { path: '/b', element: <div>B</div> },
              { path: '/c', element: <div>C</div> },
            ],
          },
        ],
        { initialEntries: ['/a'] },
      );

      render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      await act(async () => {
        router.navigate('/b');
        router.navigate('/c');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2));
      });

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);

      const calls = mockStartBrowserTracingNavigationSpan.mock.calls;
      expect(calls[0]![1].name).toBe('/b');
      expect(calls[1]![1].name).toBe('/c');
    });

    it('should create separate spans for same route with different params', async () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [{ path: '/user/:id', element: <div>User</div> }],
          },
        ],
        { initialEntries: ['/user/1'] },
      );

      render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      await act(async () => {
        router.navigate('/user/2');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1));
      });

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledWith(expect.any(BrowserClient), {
        name: '/user/:id',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });

      await act(async () => {
        router.navigate('/user/3');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2));
      });

      // Should create 2 spans - different concrete paths are different user actions
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenNthCalledWith(2, expect.any(BrowserClient), {
        name: '/user/:id',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('should handle mixed cross-usage and consecutive navigations correctly', async () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);

      const UsersRoute: React.FC = () => sentryUseRoutes([{ path: '/', element: <div>Users</div> }]);

      const SettingsRoute: React.FC = () => sentryUseRoutes([{ path: '/', element: <div>Settings</div> }]);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              { path: '/users/*', element: <UsersRoute /> },
              { path: '/settings/*', element: <SettingsRoute /> },
            ],
          },
        ],
        { initialEntries: ['/users'] },
      );

      render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(mockStartBrowserTracingNavigationSpan).not.toHaveBeenCalled();

      await act(async () => {
        router.navigate('/settings');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1));
      });

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/settings/*',
        attributes: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        }),
      });
    });

    it('should not create duplicate spans for cross-usage on same route', async () => {
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

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);
      const sentryUseRoutes = wrapUseRoutesV6(useRoutes);

      const NestedRoute: React.FC = () => sentryUseRoutes([{ path: '/', element: <div>Details</div> }]);

      const router = createSentryMemoryRouter(
        [
          {
            children: [{ path: '/details/*', element: <NestedRoute /> }],
          },
        ],
        { initialEntries: ['/home'] },
      );

      render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      await act(async () => {
        router.navigate('/details');
        await waitFor(() => expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalled());
      });

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledWith(expect.any(BrowserClient), {
        name: '/details/*',
        attributes: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        }),
      });
    });
  });
});
