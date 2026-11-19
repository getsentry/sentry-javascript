import { spanToJSON } from '@sentry/browser';
import { SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE, URL_PATH_PARAMETER_KEY_BASE } from '@sentry/conventions/attributes';
import { NAVIGATION } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { createTransport, getCurrentScope, setCurrentClient } from '@sentry/core';
import type { Navigator, RouteSectionProps } from '@solidjs/router';
import { createRouter, memoryHistory, useNavigate } from '@solidjs/router';
import { render } from '@solidjs/web';
import { createComponent, flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/solid2';
import { solidRouterBrowserTracingIntegration, withSentryRouterRouting } from '../../src/solid2/solidrouter';

vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

const routes = [
  { path: '/', component: () => 'Home' },
  { path: '/about', component: () => 'About' },
  { path: '/user/:id', component: () => 'User' },
  { path: '/user/:id/post/:postId', component: () => 'Post' },
  {
    path: '/redirect-to-user',
    component: () => {
      useNavigate()('/user/7', { replace: true });
      return 'Redirecting';
    },
  },
];

function createMockBrowserClient(): BrowserClient {
  return new BrowserClient({
    integrations: [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
  });
}

function renderRouter(initialPath: string): { navigate: Navigator; dispose: () => void } {
  const Router = withSentryRouterRouting(createRouter({ routes, history: memoryHistory(initialPath) }));
  let navigate: Navigator | undefined;

  const dispose = render(
    () =>
      createComponent(Router, {
        children: (props: RouteSectionProps) => {
          navigate = useNavigate();
          return props.children;
        },
      }),
    document.body.appendChild(document.createElement('div')),
  );
  flush();

  return { navigate: navigate!, dispose };
}

function findSpan(spans: Span[], op: string): ReturnType<typeof spanToJSON> | undefined {
  const span = spans.find(s => spanToJSON(s).attributes?.[SENTRY_OP] === op);
  return span ? spanToJSON(span) : undefined;
}

function findLastSpan(spans: Span[], op: string): ReturnType<typeof spanToJSON> | undefined {
  const span = spans.filter(s => spanToJSON(s).attributes?.[SENTRY_OP] === op).pop();
  return span ? spanToJSON(span) : undefined;
}

describe('withSentryRouterRouting (Solid Router 2)', () => {
  let spans: Span[];
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    getCurrentScope().setClient(undefined);
    spans = [];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  function setUpClient(options: Parameters<typeof solidRouterBrowserTracingIntegration>[0] = {}): void {
    const client = createMockBrowserClient();
    setCurrentClient(client);
    client.on('spanStart', span => spans.push(span));
    client.addIntegration(solidRouterBrowserTracingIntegration(options));
  }

  // The redirect starts a navigation span of its own, like with Solid Router 1.
  it('names the navigation span of a redirect after the route it lands on', async () => {
    setUpClient();

    const { navigate, dispose } = renderRouter('/');
    cleanup = dispose;

    navigate('/redirect-to-user');
    flush();

    await vi.waitFor(() => {
      expect(findLastSpan(spans, NAVIGATION)).toMatchObject({
        name: '/user/:id',
        attributes: expect.objectContaining({
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: '7',
        }),
      });
    });
  });

  it('does not start a navigation span with `instrumentNavigation: false`', () => {
    setUpClient({ instrumentNavigation: false });

    const { navigate, dispose } = renderRouter('/');
    cleanup = dispose;

    navigate('/about');
    flush();

    // Navigation spans start synchronously in `beforeLeave`, so there is nothing to wait for.
    expect(findSpan(spans, NAVIGATION)).toBeUndefined();
  });

  it('keeps the properties of the router instance', () => {
    const Router = createRouter({ routes, history: memoryHistory('/') });
    const SentryRouter = withSentryRouterRouting(Router);

    expect(SentryRouter.routes).toBe(Router.routes);
    expect(SentryRouter.config).toBe(Router.config);
    expect(SentryRouter.match('/user/5')).toEqual(Router.match('/user/5'));
  });
});
