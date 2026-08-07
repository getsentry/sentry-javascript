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
import { URL_TEMPLATE } from '@sentry/conventions/attributes';
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
  getStreamedSpanJSON() {
    return { attributes: { 'sentry.op': 'pageload' } };
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

async function coreMock(requireActual: () => Promise<any>) {
  return {
    ...(await requireActual()),
    getRootSpan: () => {
      return mockRootSpan;
    },
  };
}

vi.mock('@sentry/core', coreMock);
vi.mock('@sentry/core/browser', coreMock);

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
    it('keeps the parent path prefix for descendant routes with non-wildcard nested children - pageload', () => {
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

      // A descendant <SentryRoutes> whose matched route (`:id` via its index) sits above further nested
      // non-wildcard child routes (`:sub`). The nested subtree must not steal the transaction name from
      // the `child/*` parent (see issue #22194).
      const ChildRouter = () => (
        <SentryRoutes>
          <Route path=":id">
            <Route index element={<div id="child">Child</div>} />
            <Route path=":sub">
              <Route index element={<div>Sub</div>} />
            </Route>
          </Route>
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/child/abc123']}>
          <SentryRoutes>
            <Route path="child/*" element={<ChildRouter />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Child');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/child/:id');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(URL_TEMPLATE, '/child/:id');
    });

    it('keeps the parent path prefix for descendant routes with non-wildcard nested children - navigation', () => {
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

      const ChildRouter = () => (
        <SentryRoutes>
          <Route path=":id">
            <Route index element={<div id="child">Child</div>} />
            <Route path=":sub">
              <Route index element={<div>Sub</div>} />
            </Route>
          </Route>
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/child/abc123" />} />
            <Route path="child/*" element={<ChildRouter />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Child');
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/child/:id',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [URL_TEMPLATE]: '/child/:id',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('prefers a concrete sibling route over a descendant wildcard parent', () => {
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

      const ChildRouter = () => (
        <SentryRoutes>
          <Route path=":id">
            <Route index element={<div id="child">Child</div>} />
            <Route path=":sub">
              <Route index element={<div>Sub</div>} />
            </Route>
          </Route>
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/child/settings']}>
          <SentryRoutes>
            <Route path="child/settings" element={<div id="settings">Settings</div>} />
            <Route path="child/*" element={<ChildRouter />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Settings');
      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/child/settings');
    });

    it('keeps the parent path prefix for a dynamic-lead descendant parent with non-wildcard nested children - pageload', () => {
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

      // The descendant parent has a dynamic leading segment (`:orgId/*`). The nested `:sub` subtree must
      // not steal the transaction name - it should stay `/:orgId/:id`, not `/:id/:sub`.
      const OrgRouter = () => (
        <SentryRoutes>
          <Route path=":id">
            <Route index element={<div id="org">Org</div>} />
            <Route path=":sub">
              <Route index element={<div>Sub</div>} />
            </Route>
          </Route>
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/acme/abc123']}>
          <SentryRoutes>
            <Route path=":orgId/*" element={<OrgRouter />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Org');

      expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
      expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/:orgId/:id');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(URL_TEMPLATE, '/:orgId/:id');
    });

    it('keeps the parent path prefix for a dynamic-lead descendant parent with non-wildcard nested children - navigation', () => {
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

      const OrgRouter = () => (
        <SentryRoutes>
          <Route path=":id">
            <Route index element={<div id="org">Org</div>} />
            <Route path=":sub">
              <Route index element={<div>Sub</div>} />
            </Route>
          </Route>
        </SentryRoutes>
      );

      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route index element={<Navigate to="/acme/abc123" />} />
            <Route path=":orgId/*" element={<OrgRouter />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(container.innerHTML).toContain('Org');
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
        name: '/:orgId/:id',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [URL_TEMPLATE]: '/:orgId/:id',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

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
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(
        URL_TEMPLATE,
        '/projects/:projectId/views/:viewId/:detailId',
      );
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
          [URL_TEMPLATE]: '/projects/:projectId/views/:viewId/:detailId',
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
          [URL_TEMPLATE]: '/projects/:projectId/views/:viewId/:detailId',
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
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(
        URL_TEMPLATE,
        '/projects/:projectId/views/:viewId/:detailId',
      );
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
          [URL_TEMPLATE]: '/projects/:projectId/views/:viewId/:detailId',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });
  });
});
