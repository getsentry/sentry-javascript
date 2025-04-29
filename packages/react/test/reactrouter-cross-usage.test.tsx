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
import {
  reactRouterV6BrowserTracingIntegration,
  withSentryReactRouterV6Routing,
  wrapCreateMemoryRouterV6,
  wrapUseRoutesV6,
} from '../src/reactrouterv6';

const mockStartBrowserTracingPageLoadSpan = vi.fn();
const mockStartBrowserTracingNavigationSpan = vi.fn();

const mockNavigationSpan = {
  updateName: vi.fn(),
  setAttribute: vi.fn(),
};

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
          {
            path: '/',
            element: <div />,
          },
          {
            path: ':id',
            element: <ThirdLevel />,
          },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'third-level/*',
            element: <ThirdLevelRoutes />,
          },
          {
            path: '/',
            element: <div />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'second-level/:id/*',
            element: <SecondLevelRoutes />,
          },
          {
            path: '/',
            element: <div />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              {
                path: '/*',
                element: <TopLevelRoutes />,
              },
            ],
          },
        ],
        {
          initialEntries: ['/second-level/321/third-level/123'],
        },
      );

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
          {
            path: '/',
            element: <div />,
          },
          {
            path: ':id',
            element: <ThirdLevel />,
          },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'third-level/*',
            element: <ThirdLevelRoutes />,
          },
          {
            path: '/',
            element: <div />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'second-level/:id/*',
            element: <SecondLevelRoutes />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              {
                path: '/*',
                element: <TopLevelRoutes />,
              },
              {
                path: '/navigate',
                element: <Navigate to="/second-level/321/third-level/123" />,
              },
            ],
          },
        ],
        {
          initialEntries: ['/navigate'],
        },
      );

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      // It's called 1 time from the wrapped `MemoryRouter`
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // It's called 3 times from the 3 `useRoutes` components
      expect(mockNavigationSpan.updateName).toHaveBeenCalledTimes(3);
      expect(mockNavigationSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/second-level/:id/third-level/:id',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
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
          {
            path: '/',
            element: <div />,
          },
          {
            path: ':id',
            element: <ThirdLevel />,
          },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'third-level/*',
            element: <ThirdLevelRoutes />,
          },
          {
            path: '/',
            element: <div />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'second-level/:id/*',
            element: <SecondLevelRoutes />,
          },
          {
            path: '/',
            element: <div />,
          },
          {
            path: '*',
            element: <div />,
          },
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
          {
            path: '/',
            element: <div />,
          },
          {
            path: ':id',
            element: <ThirdLevel />,
          },
        ]);

      const SecondLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'third-level/*',
            element: <ThirdLevelRoutes />,
          },
          {
            path: '/',
            element: <div />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const TopLevelRoutes: React.FC = () =>
        sentryUseRoutes([
          {
            path: 'second-level/:id/*',
            element: <SecondLevelRoutes />,
          },
          {
            path: '*',
            element: <div />,
          },
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

      // It's called 1 time from the wrapped `MemoryRouter`
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // It's called 3 times from the 3 `useRoutes` components
      expect(mockNavigationSpan.updateName).toHaveBeenCalledTimes(3);
      expect(mockNavigationSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');
      expect(mockNavigationSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
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

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              {
                path: '/*',
                element: <TopLevelRoutes />,
              },
            ],
          },
        ],
        {
          initialEntries: ['/second-level/321/third-level/123'],
        },
      );

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
              {
                path: '/*',
                element: <TopLevelRoutes />,
              },
              {
                path: '/navigate',
                element: <Navigate to="/second-level/321/third-level/123" />,
              },
            ],
          },
        ],
        {
          initialEntries: ['/navigate'],
        },
      );

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      // It's called 1 time from the wrapped `createMemoryRouter`
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // It's called 3 times from the 3 `SentryRoutes` components
      expect(mockNavigationSpan.updateName).toHaveBeenCalledTimes(3);
      expect(mockNavigationSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');

      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/second-level/:id/third-level/:id',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
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
          {
            path: '/',
            element: <div />,
          },
          {
            path: ':id',
            element: <ThirdLevel />,
          },
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
          {
            path: 'second-level/:id/*',
            element: <SecondLevelRoutes />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              {
                path: '/*',
                element: <TopLevelRoutes />,
              },
            ],
          },
        ],
        {
          initialEntries: ['/second-level/321/third-level/123'],
        },
      );

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
          {
            path: '/',
            element: <div />,
          },
          {
            path: ':id',
            element: <ThirdLevel />,
          },
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
          {
            path: 'second-level/:id/*',
            element: <SecondLevelRoutes />,
          },
          {
            path: '*',
            element: <div />,
          },
        ]);

      const createSentryMemoryRouter = wrapCreateMemoryRouterV6(createMemoryRouter);

      const router = createSentryMemoryRouter(
        [
          {
            children: [
              {
                path: '/*',
                element: <TopLevelRoutes />,
              },
              {
                path: '/navigate',
                element: <Navigate to="/second-level/321/third-level/123" />,
              },
            ],
          },
        ],
        {
          initialEntries: ['/navigate'],
        },
      );

      const { container } = render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      );

      expect(container.innerHTML).toContain('Details');

      // It's called 1 time from the wrapped `MemoryRouter`
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // It's called 3 times from the 2 `useRoutes` components and 1 <SentryRoutes> component
      expect(mockNavigationSpan.updateName).toHaveBeenCalledTimes(3);

      expect(mockNavigationSpan.updateName).toHaveBeenLastCalledWith('/second-level/:id/third-level/:id');
      expect(mockNavigationSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });
  });
});
