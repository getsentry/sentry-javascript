import { spanToJSON } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  createTransport,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
} from '@sentry/core';
import type { MemoryHistory } from '@solidjs/router';
import { createMemoryHistory, MemoryRouter, Navigate, Route } from '@solidjs/router';
import { render, waitFor } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../src';
import { solidRouterBrowserTracingIntegration, withSentryRouterRouting } from '../src/solidrouter';

// solid router uses `window.scrollTo` when navigating
vi.spyOn(global, 'scrollTo').mockImplementation(() => {});

const renderRouter = (SentryRouter: typeof MemoryRouter, history: MemoryHistory) =>
  render(() => (
    <SentryRouter history={history}>
      <Route path="/" component={() => <div>Home</div>} />
      <Route path="/about">
        <Route path="/" component={() => <div>About</div>} />
        <Route path="/us" component={() => <div>us</div>} />
      </Route>
      <Route path="/user">
        <Route path="/:id" component={() => <div>User</div>} />
        <Route path="/:id/post/:postId" component={() => <div>Post</div>} />
      </Route>
      <Route path="/navigate-to-about" component={() => <Navigate href="/about" />} />
      <Route path="/navigate-to-about-us" component={() => <Navigate href="/about/us" />} />
      <Route path="/navigate-to-user" component={() => <Navigate href="/user/5" />} />
      <Route path="/navigate-to-user-post" component={() => <Navigate href="/user/5/post/12" />} />
    </SentryRouter>
  ));

describe('solidRouterBrowserTracingIntegration', () => {
  function createMockBrowserClient(): BrowserClient {
    return new BrowserClient({
      integrations: [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solid',
        },
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentScope().setClient(undefined);
  });

  it('starts a pageload span', () => {
    const spanStartMock = vi.fn();

    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.on('spanStart', span => spanStartMock(spanToJSON(span)));
    client.addIntegration(solidRouterBrowserTracingIntegration());

    const history = createMemoryHistory();
    history.set({ value: '/' });

    expect(spanStartMock).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'pageload',
        description: '/',
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
        }),
      }),
    );
  });

  it('skips pageload span, with `instrumentPageLoad: false`', () => {
    const spanStartMock = vi.fn();

    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.on('spanStart', span => spanStartMock(spanToJSON(span)));
    client.addIntegration(
      solidRouterBrowserTracingIntegration({
        instrumentPageLoad: false,
      }),
    );
    const SentryRouter = withSentryRouterRouting(MemoryRouter);

    const history = createMemoryHistory();
    history.set({ value: '/' });

    renderRouter(SentryRouter, history);

    expect(spanStartMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'pageload',
        description: '/',
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
        }),
      }),
    );
  });

  it.each([
    ['', '/navigate-to-about', '/about', {}],
    ['for nested navigation', '/navigate-to-about-us', '/about/us', {}],
    ['for navigation with param', '/navigate-to-user', '/user/:id', { id: '5' }],
    [
      'for nested navigation with params',
      '/navigate-to-user-post',
      '/user/:id/post/:postId',
      { id: '5', postId: '12' },
    ],
  ])(
    'starts a parametrized navigation span %s',
    async (_itDescription, navigationPath, parametrizedRoute, expectedParams) => {
      const spans: Span[] = [];

      const client = createMockBrowserClient();
      setCurrentClient(client);

      client.on('spanStart', span => {
        spans.push(span);
      });
      client.addIntegration(solidRouterBrowserTracingIntegration());
      const SentryRouter = withSentryRouterRouting(MemoryRouter);

      const history = createMemoryHistory();
      history.set({ value: navigationPath });

      renderRouter(SentryRouter, history);

      // Wait for the router transition to complete (Navigate redirects are async)
      await waitFor(() => {
        const navSpan = spans.find(s => spanToJSON(s).op === 'navigation');
        expect(navSpan).toBeDefined();

        const span = spanToJSON(navSpan!);
        expect(span.description).toBe(parametrizedRoute);
        expect(span.data).toMatchObject({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.solid.solidrouter',
        });

        for (const [key, value] of Object.entries(expectedParams as Record<string, string>)) {
          expect(span.data![`url.path.parameter.${key}`]).toBe(value);
          expect(span.data![`params.${key}`]).toBe(value);
        }
      });
    },
  );

  it('skips navigation span, with `instrumentNavigation: false`', () => {
    const spanStartMock = vi.fn();

    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.on('spanStart', span => spanStartMock(spanToJSON(span)));
    client.addIntegration(
      solidRouterBrowserTracingIntegration({
        instrumentNavigation: false,
      }),
    );
    const SentryRouter = withSentryRouterRouting(MemoryRouter);

    const history = createMemoryHistory();
    history.set({ value: '/navigate-to-about' });

    renderRouter(SentryRouter, history);

    expect(spanStartMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'navigation',
        description: '/about',
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.solid.solidrouter',
        }),
      }),
    );
  });

  it("updates the scope's `transactionName` on a navigation", () => {
    const spanStartMock = vi.fn();

    const client = createMockBrowserClient();
    setCurrentClient(client);

    client.on('spanStart', span => {
      spanStartMock(spanToJSON(span));
    });
    client.addIntegration(solidRouterBrowserTracingIntegration());
    const SentryRouter = withSentryRouterRouting(MemoryRouter);

    const history = createMemoryHistory();
    history.set({ value: '/navigate-to-about' });

    renderRouter(SentryRouter, history);

    expect(getCurrentScope().getScopeData()?.transactionName).toBe('/about');
  });
});
