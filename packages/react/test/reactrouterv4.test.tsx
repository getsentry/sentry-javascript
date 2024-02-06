import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  createTransport,
  getCurrentScope,
  setCurrentClient,
} from '@sentry/core';
import { act, render } from '@testing-library/react';
import { createMemoryHistory } from 'history-4';
// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';
import { Route, Router, Switch, matchPath } from 'react-router-4';

import {
  BrowserClient,
  reactRouterV4BrowserTracingIntegration,
  reactRouterV4Instrumentation,
  withSentryRouting,
} from '../src';
import type { RouteConfig } from '../src/reactrouter';

describe('reactRouterV4Instrumentation', () => {
  function createInstrumentation(_opts?: {
    startTransactionOnPageLoad?: boolean;
    startTransactionOnLocationChange?: boolean;
    routes?: RouteConfig[];
  }): [jest.Mock, any, { mockUpdateName: jest.Mock; mockFinish: jest.Mock; mockSetAttribute: jest.Mock }] {
    const options = {
      matchPath: _opts && _opts.routes !== undefined ? matchPath : undefined,
      routes: undefined,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ..._opts,
    };
    const history = createMemoryHistory();
    const mockFinish = jest.fn();
    const mockUpdateName = jest.fn();
    const mockSetAttribute = jest.fn();
    const mockStartTransaction = jest
      .fn()
      .mockReturnValue({ updateName: mockUpdateName, end: mockFinish, setAttribute: mockSetAttribute });
    // eslint-disable-next-line deprecation/deprecation
    reactRouterV4Instrumentation(history, options.routes, options.matchPath)(
      mockStartTransaction,
      options.startTransactionOnPageLoad,
      options.startTransactionOnLocationChange,
    );
    return [mockStartTransaction, history, { mockUpdateName, mockFinish, mockSetAttribute }];
  }

  it('starts a pageload transaction when instrumentation is started', () => {
    const [mockStartTransaction] = createInstrumentation();
    expect(mockStartTransaction).toHaveBeenCalledTimes(1);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      },
    });
  });

  it('does not start pageload transaction if option is false', () => {
    const [mockStartTransaction] = createInstrumentation({ startTransactionOnPageLoad: false });
    expect(mockStartTransaction).toHaveBeenCalledTimes(0);
  });

  it('starts a navigation transaction', () => {
    const [mockStartTransaction, history] = createInstrumentation();
    render(
      <Router history={history}>
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
    expect(mockStartTransaction).toHaveBeenCalledTimes(2);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
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
    expect(mockStartTransaction).toHaveBeenCalledTimes(3);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/features',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
  });

  it('does not start a transaction if option is false', () => {
    const [mockStartTransaction, history] = createInstrumentation({ startTransactionOnLocationChange: false });
    render(
      <Router history={history}>
        <Switch>
          <Route path="/features" component={() => <div>Features</div>} />
          <Route path="/about" component={() => <div>About</div>} />
          <Route path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );
    expect(mockStartTransaction).toHaveBeenCalledTimes(1);
  });

  it('only starts a navigation transaction on push', () => {
    const [mockStartTransaction, history] = createInstrumentation();
    render(
      <Router history={history}>
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
    expect(mockStartTransaction).toHaveBeenCalledTimes(1);
  });

  it('finishes a transaction on navigation', () => {
    const [mockStartTransaction, history, { mockFinish }] = createInstrumentation();
    render(
      <Router history={history}>
        <Switch>
          <Route path="/features" component={() => <div>Features</div>} />
          <Route path="/about" component={() => <div>About</div>} />
          <Route path="/" component={() => <div>Home</div>} />
        </Switch>
      </Router>,
    );
    expect(mockStartTransaction).toHaveBeenCalledTimes(1);

    act(() => {
      history.push('/features');
    });
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockStartTransaction).toHaveBeenCalledTimes(2);
  });

  it('does not normalize transaction name ', () => {
    const [mockStartTransaction, history] = createInstrumentation();
    const { getByText } = render(
      <Router history={history}>
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

    expect(mockStartTransaction).toHaveBeenCalledTimes(2);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/users/123',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
  });

  it('normalizes transaction name with custom Route', () => {
    const [mockStartTransaction, history, { mockUpdateName, mockSetAttribute }] = createInstrumentation();
    const SentryRoute = withSentryRouting(Route);
    const { getByText } = render(
      <Router history={history}>
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

    expect(mockStartTransaction).toHaveBeenCalledTimes(2);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/users/123',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(mockUpdateName).toHaveBeenCalledTimes(2);
    expect(mockUpdateName).toHaveBeenLastCalledWith('/users/:userid');
    expect(mockSetAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  it('normalizes nested transaction names with custom Route', () => {
    const [mockStartTransaction, history, { mockUpdateName, mockSetAttribute }] = createInstrumentation();
    const SentryRoute = withSentryRouting(Route);
    const { getByText } = render(
      <Router history={history}>
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

    expect(mockStartTransaction).toHaveBeenCalledTimes(2);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/organizations/1234/v1/758',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(mockUpdateName).toHaveBeenCalledTimes(2);
    expect(mockUpdateName).toHaveBeenLastCalledWith('/organizations/:orgid/v1/:teamid');
    expect(mockSetAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    act(() => {
      history.push('/organizations/543');
    });
    getByText('OrgId');

    expect(mockStartTransaction).toHaveBeenCalledTimes(3);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/organizations/543',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
    });
    expect(mockUpdateName).toHaveBeenCalledTimes(3);
    expect(mockUpdateName).toHaveBeenLastCalledWith('/organizations/:orgid');
    expect(mockSetAttribute).toHaveBeenLastCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  it('matches with route object', () => {
    const routes: RouteConfig[] = [
      {
        path: '/organizations/:orgid/v1/:teamid',
      },
      { path: '/organizations/:orgid' },
      { path: '/' },
    ];
    const [mockStartTransaction, history] = createInstrumentation({ routes });
    render(
      <Router history={history}>
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
    expect(mockStartTransaction).toHaveBeenCalledTimes(2);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
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
    expect(mockStartTransaction).toHaveBeenCalledTimes(3);
    expect(mockStartTransaction).toHaveBeenLastCalledWith({
      name: '/organizations/:orgid',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v4',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      },
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

describe('browserTracingReactRouterV4', () => {
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
});
