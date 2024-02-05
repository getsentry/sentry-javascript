import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  createTransport,
  getCurrentScope,
  setCurrentClient,
} from '@sentry/core';
import { render } from '@testing-library/react';
import * as React from 'react';
import {
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  createRoutesFromChildren,
  matchPath,
  matchRoutes,
  useLocation,
  useNavigationType,
  useRoutes,
} from 'react-router-6';

import { BrowserClient, reactRouterV6Instrumentation } from '../src';
import {
  browserTracingReactRouterV6Integration,
  withSentryReactRouterV6Routing,
  wrapUseRoutes,
} from '../src/reactrouterv6';

describe('reactRouterV6Instrumentation', () => {
  function createInstrumentation(_opts?: {
    startTransactionOnPageLoad?: boolean;
    startTransactionOnLocationChange?: boolean;
  }): [jest.Mock, { mockUpdateName: jest.Mock; mockFinish: jest.Mock; mockSetAttribute: jest.Mock }] {
    const options = {
      matchPath: _opts ? matchPath : undefined,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ..._opts,
    };
    const mockFinish = jest.fn();
    const mockUpdateName = jest.fn();
    const mockSetAttribute = jest.fn();
    const mockStartTransaction = jest
      .fn()
      .mockReturnValue({ updateName: mockUpdateName, end: mockFinish, setAttribute: mockSetAttribute });

    // eslint-disable-next-line deprecation/deprecation
    reactRouterV6Instrumentation(
      React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    )(mockStartTransaction, options.startTransactionOnPageLoad, options.startTransactionOnLocationChange);
    return [mockStartTransaction, { mockUpdateName, mockFinish, mockSetAttribute }];
  }

  describe('withSentryReactRouterV6Routing', () => {
    it('starts a pageload transaction', () => {
      const [mockStartTransaction] = createInstrumentation();
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/" element={<div>Home</div>} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v6',
        },
      });
    });

    it('skips pageload transaction with `startTransactionOnPageLoad: false`', () => {
      const [mockStartTransaction] = createInstrumentation({ startTransactionOnPageLoad: false });
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/" element={<div>Home</div>} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartTransaction).toHaveBeenCalledTimes(0);
    });

    it('skips navigation transaction, with `startTransactionOnLocationChange: false`', () => {
      const [mockStartTransaction] = createInstrumentation({ startTransactionOnLocationChange: false });
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>} />
            <Route path="/" element={<Navigate to="/about" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v6',
        },
      });
    });

    it('starts a navigation transaction', () => {
      const [mockStartTransaction] = createInstrumentation();
      const SentryRoutes = withSentryReactRouterV6Routing(Routes);

      render(
        <MemoryRouter initialEntries={['/']}>
          <SentryRoutes>
            <Route path="/about" element={<div>About</div>} />
            <Route path="/" element={<Navigate to="/about" />} />
          </SentryRoutes>
        </MemoryRouter>,
      );

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with nested routes', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about/us',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with paramaterized paths', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about/:page',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with paths with multiple parameters', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/stores/:storeId/products/:productId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with nested paths with parameters', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/projects/:projectId/views/:viewId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });
  });

  describe('wrapUseRoutes', () => {
    it('starts a pageload transaction', () => {
      const [mockStartTransaction] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v6',
        },
      });
    });

    it('skips pageload transaction with `startTransactionOnPageLoad: false`', () => {
      const [mockStartTransaction] = createInstrumentation({ startTransactionOnPageLoad: false });
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(0);
    });

    it('skips navigation transaction, with `startTransactionOnLocationChange: false`', () => {
      const [mockStartTransaction] = createInstrumentation({ startTransactionOnLocationChange: false });
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v6',
        },
      });
    });

    it('starts a navigation transaction', () => {
      const [mockStartTransaction] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with nested routes', () => {
      const [mockStartTransaction] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about/us',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with paramaterized paths', () => {
      const [mockStartTransaction] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about/:page',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with paths with multiple parameters', () => {
      const [mockStartTransaction] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/stores/:storeId/products/:productId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('works with nested paths with parameters', () => {
      const [mockStartTransaction] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/projects/:projectId/views/:viewId',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
        },
      });
    });

    it('does not add double slashes to URLS', () => {
      const [mockStartTransaction, { mockUpdateName, mockSetAttribute }] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      // should be /tests not //tests
      expect(mockUpdateName).toHaveBeenLastCalledWith('/tests');
      expect(mockSetAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });

    it('handles wildcard routes properly', () => {
      const [mockStartTransaction, { mockUpdateName, mockSetAttribute }] = createInstrumentation();
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockUpdateName).toHaveBeenLastCalledWith('/tests/:testId/*');
      expect(mockSetAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    });
  });
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

describe('browserTracingReactRouterV6Integration', () => {
  function createMockBrowserClient(): BrowserClient {
    return new BrowserClient({
      integrations: [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
      debug: true,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentScope().setClient(undefined);
  });

  describe('withSentryReactRouterV6Routing', () => {
    it('starts a pageload transaction', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
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

    it('skips pageload transaction with `instrumentPageLoad: false`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
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
        browserTracingReactRouterV6Integration({
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
        browserTracingReactRouterV6Integration({
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
        browserTracingReactRouterV6Integration({
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

    it('works with paramaterized paths', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
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
        browserTracingReactRouterV6Integration({
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
        browserTracingReactRouterV6Integration({
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
  });

  describe('wrapUseRoutes', () => {
    it('starts a pageload transaction', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );

      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

    it('skips pageload transaction with `instrumentPageLoad: false`', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          instrumentPageLoad: false,
        }),
      );

      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          instrumentNavigation: false,
        }),
      );

      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

    it('works with paramaterized paths', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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

    it('does not add double slashes to URLS', () => {
      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.addIntegration(
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
        browserTracingReactRouterV6Integration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      );
      const wrappedUseRoutes = wrapUseRoutes(useRoutes);

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
  });
});
