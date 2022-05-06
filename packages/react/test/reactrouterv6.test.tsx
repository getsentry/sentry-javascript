import { render } from '@testing-library/react';
import * as React from 'react';
import {
  createRoutesFromChildren,
  matchPath,
  matchRoutes,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-6';

import { reactRouterV6Instrumentation } from '../src';
import { withSentryV6 } from '../src/reactrouterv6';

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

  it('starts a pageload transaction', () => {
    const [mockStartTransaction] = createInstrumentation();
    const SentryRoutes = withSentryV6(Routes);

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
      tags: { 'routing.instrumentation': 'react-router-v6' },
    });
  });

  it('skips pageload transaction with `startTransactionOnPageLoad: false`', () => {
    const [mockStartTransaction] = createInstrumentation({ startTransactionOnPageLoad: false });
    const SentryRoutes = withSentryV6(Routes);

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
    const SentryRoutes = withSentryV6(Routes);

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
      tags: { 'routing.instrumentation': 'react-router-v6' },
    });
  });

  it('starts a navigation transaction', () => {
    const [mockStartTransaction] = createInstrumentation();
    const SentryRoutes = withSentryV6(Routes);

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
      tags: { 'routing.instrumentation': 'react-router-v6' },
    });
  });

  it('works with nested routes', () => {
    const [mockStartTransaction] = createInstrumentation();
    const SentryRoutes = withSentryV6(Routes);

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
      tags: { 'routing.instrumentation': 'react-router-v6' },
    });
  });

  it('works with original paths', () => {
    const [mockStartTransaction] = createInstrumentation();
    const SentryRoutes = withSentryV6(Routes);

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
      tags: { 'routing.instrumentation': 'react-router-v6' },
    });
  });
});
