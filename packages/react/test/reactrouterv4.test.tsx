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
import { act, render } from '@testing-library/react';
import { createMemoryHistory } from 'history-4';
import * as React from 'react';
import { matchPath, Route, Router, Switch } from 'react-router-4';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient, reactRouterV4BrowserTracingIntegration, withSentryRouting } from '../src';
import type { RouteConfig } from '../src/reactrouter';

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

describe('browserTracingReactRouterV4', () => {
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

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      },
    });
  });

  it("updates the scope's `transactionName` on pageload", () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    expect(getCurrentScope().getScopeData().transactionName).toEqual('/');
  });

  it('starts a navigation transaction', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    render(
      <Router history={history as any}>
        <Switch>
          <Route path="/features" component={() => <div>Features</div>} />
          <Route path="/about" component={() => <div>About</div>} />
          <Route path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.push('/about');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/about',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
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
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
  });

  it('only starts a navigation transaction on push', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    render(
      <Router history={history as any}>
        <Switch>
          <Route path="/features" component={() => <div>Features</div>} />
          <Route path="/about" component={() => <div>About</div>} />
          <Route path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.replace('hello');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(0);
  });

  it('does not normalize transaction name ', () => {
    const client = createMockBrowserClient();

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    const { getByText } = render(
      <Router history={history as any}>
        <Switch>
          <Route path="/users/:userid" component={() => <div>UserId</div>} />
          <Route path="/users" component={() => <div>Users</div>} />
          <Route path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.push('/users/123');
    });
    getByText('UserId');

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/users/123',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
  });

  it('normalizes transaction name with custom Route', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    const SentryRoute = withSentryRouting(Route);

    const { getByText } = render(
      <Router history={history as any}>
        <Switch>
          <SentryRoute path="/users/:userid" component={() => <div>UserId</div>} />
          <SentryRoute path="/users" component={() => <div>Users</div>} />
          <SentryRoute path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.push('/users/123');
    });
    getByText('UserId');

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/users/123',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(mockRootSpan.updateName).toHaveBeenCalledTimes(2);
    expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/users/:userid');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  it('normalizes nested transaction names with custom Route', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history }));

    client.init();

    const SentryRoute = withSentryRouting(Route);

    const { getByText } = render(
      <Router history={history as any}>
        <Switch>
          <SentryRoute path="/organizations/:orgid/v1/:teamid" component={() => <div>Team</div>} />
          <SentryRoute path="/organizations/:orgid" component={() => <div>OrgId</div>} />
          <SentryRoute path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.push('/organizations/1234/v1/758');
    });
    getByText('Team');

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/organizations/1234/v1/758',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(mockRootSpan.updateName).toHaveBeenCalledTimes(2);
    expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/organizations/:orgid/v1/:teamid');
    expect(mockRootSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    act(() => {
      history.push('/organizations/543');
    });
    getByText('OrgId');

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/organizations/543',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(mockRootSpan.updateName).toHaveBeenCalledTimes(3);
    expect(mockRootSpan.updateName).toHaveBeenLastCalledWith('/organizations/:orgid');
    expect(mockRootSpan.setAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  it('matches with route object', () => {
    const routes: RouteConfig[] = [
      {
        path: '/organizations/:orgid/v1/:teamid',
      },
      { path: '/organizations/:orgid' },
      { path: '/' },
    ];
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history, routes, matchPath }));

    client.init();

    render(
      <Router history={history as any}>
        <Switch>
          <Route path="/organizations/:orgid/v1/:teamid" component={() => <div>Team</div>} />
          <Route path="/organizations/:orgid" component={() => <div>OrgId</div>} />
          <Route path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.push('/organizations/1234/v1/758');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/organizations/:orgid/v1/:teamid',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });

    act(() => {
      history.push('/organizations/1234');
    });
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/organizations/:orgid',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
  });

  it("updates the scope's `transactionName` on a route change", () => {
    const routes: RouteConfig[] = [
      {
        path: '/organizations/:orgid/v1/:teamid',
      },
      { path: '/organizations/:orgid' },
      { path: '/' },
    ];
    const client = createMockBrowserClient();
    setCurrentClient(client);

    const history = createMemoryHistory();
    client.addIntegration(reactRouterV4BrowserTracingIntegration({ history, routes, matchPath }));

    client.init();

    const SentryRoute = withSentryRouting(Route);

    render(
      <Router history={history as any}>
        <Switch>
          <SentryRoute path="/organizations/:orgid/v1/:teamid" component={() => <div>Team</div>} />
          <SentryRoute path="/organizations/:orgid" component={() => <div>OrgId</div>} />
          <SentryRoute path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );

    act(() => {
      history.push('/organizations/1234/v1/758');
    });

    expect(getCurrentScope().getScopeData().transactionName).toEqual('/organizations/:orgid/v1/:teamid');

    act(() => {
      history.push('/organizations/1234');
    });

    expect(getCurrentScope().getScopeData().transactionName).toEqual('/organizations/:orgid');
  });
});
