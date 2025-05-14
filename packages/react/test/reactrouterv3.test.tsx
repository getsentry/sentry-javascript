/**
 * @vitest-environment jsdom
 */
import { BrowserClient } from '@sentry/browser';
import {
  createTransport,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
} from '@sentry/core';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { createMemoryHistory, createRoutes, IndexRoute, match, Route, Router } from 'react-router-3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactRouterV3BrowserTracingIntegration } from '../src/reactrouterv3';

const mockStartBrowserTracingPageLoadSpan = vi.fn();
const mockStartBrowserTracingNavigationSpan = vi.fn();

const mockRootSpan = {
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

describe('browserTracingReactRouterV3', () => {
  const routes = (
    <Route path="/" component={({ children }: { children: JSX.Element }) => <div>{children}</div>}>
      <IndexRoute component={() => <div>Home</div>} />
      <Route path="about" component={() => <div>About</div>} />
      <Route path="features" component={() => <div>Features</div>} />
      <Route
        path="users/:userid"
        component={({ params }: { params: Record<string, string> }) => <div>{params.userid}</div>}
      />
      <Route path="organizations/">
        <Route path=":orgid" component={() => <div>OrgId</div>} />
        <Route path=":orgid/v1/:teamid" component={() => <div>Team</div>} />
      </Route>
      <Route path="teams">
        <Route path=":teamId">
          <Route path="details" component={() => <div>Team Details</div>} />
        </Route>
      </Route>
    </Route>
  );
  const history = createMemoryHistory();

  const instrumentationRoutes = createRoutes(routes);

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

  it('starts a pageload transaction when instrumentation is started', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.addIntegration(reactRouterV3BrowserTracingIntegration({ history, routes: instrumentationRoutes, match }));

    client.init();
    render(<Router history={history}>{routes}</Router>);

    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v3',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      },
    });
  });

  it("updates the scope's `transactionName` on pageload", () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.addIntegration(reactRouterV3BrowserTracingIntegration({ history, routes: instrumentationRoutes, match }));

    client.init();
    render(<Router history={history}>{routes}</Router>);

    expect(getCurrentScope().getScopeData().transactionName).toEqual('/');
  });

  it('starts a navigation transaction', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV3BrowserTracingIntegration({ history, routes: instrumentationRoutes, match }));

    client.init();
    render(<Router history={history}>{routes}</Router>);

    act(() => {
      history.push('/about');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/about',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v3',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });

    act(() => {
      history.push('/features');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/features',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v3',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
  });

  it('only starts a navigation transaction on push', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV3BrowserTracingIntegration({ history, routes: instrumentationRoutes, match }));

    client.init();
    render(<Router history={history}>{routes}</Router>);

    act(() => {
      history.replace('hello');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(0);
  });

  it('normalizes transaction name ', () => {
    const client = createMockBrowserClient();

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV3BrowserTracingIntegration({ history, routes: instrumentationRoutes, match }));

    client.init();
    const { container } = render(<Router history={history}>{routes}</Router>);

    act(() => {
      history.push('/users/123');
    });
    expect(container.innerHTML).toContain('123');

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/users/:userid',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v3',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(getCurrentScope().getScopeData().transactionName).toEqual('/users/:userid');

    act(() => {
      history.push('/teams/456/details');
    });

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/teams/:teamId/details',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v3',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(getCurrentScope().getScopeData().transactionName).toEqual('/teams/:teamId/details');
  });

  it("updates the scope's `transactionName` on a navigation", () => {
    const client = createMockBrowserClient();

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV3BrowserTracingIntegration({ history, routes: instrumentationRoutes, match }));

    client.init();
    const { container } = render(<Router history={history}>{routes}</Router>);

    expect(getCurrentScope().getScopeData().transactionName).toEqual('/');

    act(() => {
      history.push('/users/123');
    });
    expect(container.innerHTML).toContain('123');

    expect(getCurrentScope().getScopeData().transactionName).toEqual('/users/:userid');
  });
});
