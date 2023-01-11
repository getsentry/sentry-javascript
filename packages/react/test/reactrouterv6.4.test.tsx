import { render } from '@testing-library/react';
import { Request } from 'node-fetch';
import * as React from 'react';
import {
  createMemoryRouter,
  createRoutesFromChildren,
  matchPath,
  matchRoutes,
  Navigate,
  RouterProvider,
  useLocation,
  useNavigationType,
} from 'react-router-6.4';

import { reactRouterV6Instrumentation,wrapCreateBrowserRouter  } from '../src';
import type { CreateRouterFunction } from '../src/types';

beforeAll(() => {
  // @ts-ignore need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = Request;
});

describe('React Router v6.4', () => {
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

  describe('wrapCreateBrowserRouter', () => {
    it('starts a pageload transaction', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      render(<RouterProvider router={router} />);

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: '/',
        op: 'pageload',
        tags: {
          'routing.instrumentation': 'react-router-v6',
        },
        metadata: {
          source: 'url',
        },
      });
    });

    it('starts a navigation transaction', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      render(<RouterProvider router={router} />);

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about',
        op: 'navigation',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
      });
    });

    it('works with nested routes', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      render(<RouterProvider router={router} />);

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about/us',
        op: 'navigation',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
      });
    });

    it('works with parameterized paths', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      render(<RouterProvider router={router} />);

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/about/:page',
        op: 'navigation',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
      });
    });

    it('works with paths with multiple parameters', () => {
      const [mockStartTransaction] = createInstrumentation();
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

      render(<RouterProvider router={router} />);

      expect(mockStartTransaction).toHaveBeenCalledTimes(2);
      expect(mockStartTransaction).toHaveBeenLastCalledWith({
        name: '/stores/:storeId/products/:productId',
        op: 'navigation',
        tags: { 'routing.instrumentation': 'react-router-v6' },
        metadata: { source: 'route' },
      });
    });

    it('updates pageload transaction to a parameterized route', () => {
      const [mockStartTransaction, { mockSetName }] = createInstrumentation();
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

      render(<RouterProvider router={router} />);

      expect(mockStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockSetName).toHaveBeenLastCalledWith('/about/:page', 'route');
    });
  });
});
