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
  createRoutesFromChildren,
  matchRoutes,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
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

describe('React Router Descendant Routes', () => {
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

  describe('withSentryReactRouterV6Routing', () => {
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const DetailsRoutes = () => (
        <SentryRoutes>
          <Route path=":detailId" element={<div id="details">Details</div>} />
        </SentryRoutes>
      );

      const ViewsRoutes = () => (
        <SentryRoutes>
          <Route index element={<div id="views">Views</div>} />
          <Route path="views/:viewId/*" element={<DetailsRoutes />} />
        </SentryRoutes>
      );

      const ProjectsRoutes = () => (
        <SentryRoutes>
          <Route path="projects/:projectId/*" element={<ViewsRoutes />}></Route>
          <Route path="*" element={<div>No Match Page</div>} />
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/projects/000/views/111/222']}>
          <SentryRoutes>
            <Route path="/*" element={<ProjectsRoutes />}></Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Details');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/projects/:projectId/views/:viewId/:detailId');
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
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      const DetailsRoutes = () => (
        <SentryRoutes>
          <Route path=":detailId" element={<div id="details">Details</div>} />
        </SentryRoutes>
      );

      const ViewsRoutes = () => (
        <SentryRoutes>
          <Route index element={<div id="views">Views</div>} />
          <Route path="views/:viewId/*" element={<DetailsRoutes />} />
        </SentryRoutes>
      );

      const ProjectsRoutes = () => (
        <SentryRoutes>
          <Route path="projects/:projectId/*" element={<ViewsRoutes />}></Route>
          <Route path="*" element={<div>No Match Page</div>} />
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/projects/123/views/234/567" />} />
            <Route path="/*" element={<ProjectsRoutes />}></Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Details');
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId/:detailId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with descendant wildcard routes with outlets', () => {
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

      const DetailsRoutes = () => (
        <SentryRoutes>
          <Route path=":detailId" element={<div id="details">Details</div>} />
        </SentryRoutes>
      );

      const ViewsRoutes = () => (
        <SentryRoutes>
          <Route index element={<div id="views">Views</div>} />
          <Route path="views/:viewId/*" element={<DetailsRoutes />} />
        </SentryRoutes>
      );

      const ProjectsRoutes = () => (
        <SentryRoutes>
          <Route path="projects" element={<Outlet />}>
            <Route index element={<div>Project Page Root</div>} />
            <Route path="*" element={<Outlet />}>
              <Route path=":projectId/*" element={<ViewsRoutes />} />
            </Route>
          </Route>
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/projects/123/views/234/567" />} />
            <Route path="/*" element={<ProjectsRoutes />}></Route>
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Details');
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId/:detailId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });
  });

  describe('wrapUseRoutesV6', () => {
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const DetailsRoutes = () =>
        wrappedUseRoutes([
          {
            path: ':detailId',
            element: <div id="details">Details</div>,
          },
        ]);

      const ViewsRoutes = () =>
        wrappedUseRoutes([
          {
            index: true,
            element: <div id="views">Views</div>,
          },
          {
            path: 'views/:viewId/*',
            element: <DetailsRoutes />,
          },
        ]);

      const ProjectsRoutes = () =>
        wrappedUseRoutes([
          {
            path: 'projects/:projectId/*',
            element: <ViewsRoutes />,
          },
          {
            path: '*',
            element: <div>No Match Page</div>,
          },
        ]);

      const Routes = () =>
        wrappedUseRoutes([
          {
            path: '/*',
            element: <ProjectsRoutes />,
          },
        ]);

      const { container } = render(
        <MemoryRouter initialEntries={['/projects/123/views/456/789']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Details');
      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/projects/:projectId/views/:viewId/:detailId');
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

      const wrappedUseRoutes = wrapUseRoutesV6(useRoutes);

      const DetailsRoutes = () =>
        wrappedUseRoutes([
          {
            path: ':detailId',
            element: <div id="details">Details</div>,
          },
        ]);

      const ViewsRoutes = () =>
        wrappedUseRoutes([
          {
            index: true,
            element: <div id="views">Views</div>,
          },
          {
            path: 'views/:viewId/*',
            element: <DetailsRoutes />,
          },
        ]);

      const ProjectsRoutes = () =>
        wrappedUseRoutes([
          {
            path: 'projects/:projectId/*',
            element: <ViewsRoutes />,
          },
          {
            path: '*',
            element: <div>No Match Page</div>,
          },
        ]);

      const Routes = () =>
        wrappedUseRoutes([
          {
            index: true,
            element: <Navigate to="/projects/123/views/456/789" />,
          },
          {
            path: '/*',
            element: <ProjectsRoutes />,
          },
        ]);

      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <Routes />
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Details');
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/projects/:projectId/views/:viewId/:detailId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });
  });
});
