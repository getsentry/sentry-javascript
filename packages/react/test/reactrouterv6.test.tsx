import { render } from '@testing-library/react';
import * as React from 'react';
import {
  createRoutesFromChildren,
  matchPath,
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

import { reactRouterV6Instrumentation } from '../src';
import { withSentryReactRouterV6Routing, wrapUseRoutes } from '../src/reactrouterv6';

describe('React Router v6', () => {
  function createInstrumentation(_opts?: {
    startTransactionOnPageLoad?: boolean;
    startTransactionOnLocationChange?: boolean;
  }): [jest.Mock, { mockSetName: jest.Mock; mockFinish: jest.Mock }] {
    const options = {
      matchPath: _opts ? matchPath : undefined,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ..._opts,
    };
    const mockFinish = jest.fn();
    const mockSetName = jest.fn();
    const mockStartTransaction = jest.fn().mockReturnValue({ setName: mockSetName, finish: mockFinish });

    reactRouterV6Instrumentation(
      React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    )(mockStartTransaction, options.startTransactionOnPageLoad, options.startTransactionOnLocationChange);
    return [mockStartTransaction, { mockSetName, mockFinish }];
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
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'url' },
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
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'url' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'url' },
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
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'url' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
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
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouterv6',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
      });
    });

    it('does not add double slashes to URLS', () => {
      const [mockStartTransaction, { mockSetName }] = createInstrumentation();
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
      expect(mockSetName).toHaveBeenLastCalledWith('/tests', 'route');
    });

    it('handles wildcard routes properly', () => {
      const [mockStartTransaction, { mockSetName }] = createInstrumentation();
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
      expect(mockSetName).toHaveBeenLastCalledWith('/tests/:testId/*', 'route');
    });
  });
});
