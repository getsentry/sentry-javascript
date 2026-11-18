import { spanToJSON } from '@sentry/browser';
import { SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE, URL_FULL } from '@sentry/conventions/attributes';
import { NAVIGATION } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { createTransport, getCurrentScope, setCurrentClient } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserClient } from '../src';
import { createRouterSpanUpdater, solidRouterBrowserTracingIntegration } from '../src/solidrouter-shared';

describe('createRouterSpanUpdater', () => {
  let spans: Span[];

  beforeEach(() => {
    getCurrentScope().setClient(undefined);
    spans = [];

    const client = new BrowserClient({
      integrations: [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
    setCurrentClient(client);
    client.on('spanStart', span => spans.push(span));
    client.addIntegration(solidRouterBrowserTracingIntegration({ instrumentPageLoad: false }));
  });

  function lastNavigationSpan(): ReturnType<typeof spanToJSON> | undefined {
    const span = spans.filter(s => spanToJSON(s).attributes?.[SENTRY_OP] === NAVIGATION).pop();
    return span ? spanToJSON(span) : undefined;
  }

  it.each([
    ['back', -1],
    ['forward', 1],
    ['back by two entries', -2],
  ])('names a %s history traversal after the route it lands on', (_description, delta) => {
    const updater = createRouterSpanUpdater();

    updater.onBeforeLeave(delta);
    updater.onRouteChange({ pathname: '/user/6' }, [{ route: { pattern: '/user/:id' }, params: { id: '6' } }]);

    const span = lastNavigationSpan();
    expect(span?.name).toBe('/user/:id');
    expect(span?.attributes?.[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
    expect(span?.attributes?.[URL_FULL]).toMatch(/\/user\/6$/);
  });

  it('skips route updates for a stale location while a navigation is pending', () => {
    const updater = createRouterSpanUpdater();

    updater.onBeforeLeave('/about');
    updater.onRouteChange({ pathname: '/' }, [{ route: { pattern: '/' }, params: {} }]);

    expect(lastNavigationSpan()?.attributes?.[SENTRY_SEGMENT_NAME_SOURCE]).toBe('url');

    updater.onRouteChange({ pathname: '/about' }, [{ route: { pattern: '/about' }, params: {} }]);

    expect(lastNavigationSpan()?.name).toBe('/about');
  });
});
