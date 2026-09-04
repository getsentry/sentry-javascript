/**
 * @vitest-environment jsdom
 *
 * Tests for the `@sentry/react/router` entry point, which pulls the required React Router hooks
 * directly from `react` / `react-router` so `reactRouterBrowserTracingIntegration()` can be used
 * without passing them in.
 */
import {
  createTransport,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setCurrentClient,
} from '@sentry/core';
import { SENTRY_SEGMENT_NAME_SOURCE, URL_TEMPLATE } from '@sentry/conventions/attributes';
import { fireEvent, render } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../src';
import { allRoutes } from '../src/reactrouter-compat-utils/instrumentation';
import { reactRouterBrowserTracingIntegration, wrapReactRouterRouting } from '../src/router';

const mockStartBrowserTracingPageLoadSpan = vi.fn();
const mockStartBrowserTracingNavigationSpan = vi.fn();

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

function createMockBrowserClient(): BrowserClient {
  return new BrowserClient({
    integrations: [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
  });
}

describe('@sentry/react/router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentScope().setClient(undefined);
    allRoutes.clear();
  });

  it('reactRouterBrowserTracingIntegration() instruments a pageload without passing router hooks', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    // No arguments - the hooks are pulled from `react` / `react-router` by the entry point.
    client.addIntegration(reactRouterBrowserTracingIntegration());

    const SentryRoutes = wrapReactRouterRouting(Routes);

    render(
      <MemoryRouter initialEntries={['/about']}>
        <SentryRoutes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/about" element={<div>About</div>} />
        </SentryRoutes>
      </MemoryRouter>,
    );

    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: 'Pageload',
      attributes: {
        [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        // version-agnostic origin (no `_v6`/`_v7` suffix)
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter',
      },
    });
    expect(getCurrentScope().getScopeData().transactionName).toEqual('/about');
  });

  it('reactRouterBrowserTracingIntegration() instruments a navigation without passing router hooks', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.addIntegration(reactRouterBrowserTracingIntegration());

    const SentryRoutes = wrapReactRouterRouting(Routes);

    function Home(): React.ReactElement {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/about')}>
          to about
        </button>
      );
    }

    const { getByText } = render(
      <MemoryRouter initialEntries={['/']}>
        <SentryRoutes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<div>About</div>} />
        </SentryRoutes>
      </MemoryRouter>,
    );

    fireEvent.click(getByText('to about'));

    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    expect(mockStartBrowserTracingNavigationSpan).toHaveBeenLastCalledWith(expect.any(BrowserClient), {
      name: '/about',
      attributes: {
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        [URL_TEMPLATE]: '/about',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter',
      },
    });
  });

  it('forwards options, e.g. `instrumentPageLoad: false`', () => {
    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.addIntegration(reactRouterBrowserTracingIntegration({ instrumentPageLoad: false }));

    const SentryRoutes = wrapReactRouterRouting(Routes);

    render(
      <MemoryRouter initialEntries={['/']}>
        <SentryRoutes>
          <Route path="/" element={<div>Home</div>} />
        </SentryRoutes>
      </MemoryRouter>,
    );

    expect(mockStartBrowserTracingPageLoadSpan).toHaveBeenCalledTimes(0);
  });

  it('renders uninstrumented (no spans, no crash) when the integration is not set up', () => {
    // No client / integration - the wrapper has no client config to read, so it must fall back to
    // rendering the plain routes without instrumenting.
    const SentryRoutes = wrapReactRouterRouting(Routes);

    const { getByText } = render(
      <MemoryRouter initialEntries={['/']}>
        <SentryRoutes>
          <Route path="/" element={<div>Home</div>} />
        </SentryRoutes>
      </MemoryRouter>,
    );

    expect(getByText('Home')).toBeDefined();
    expect(mockStartBrowserTracingPageLoadSpan).not.toHaveBeenCalled();
    expect(mockStartBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });
});
