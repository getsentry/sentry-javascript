/**
 * @vitest-environment jsdom
 */

import type { Span } from '@sentry/core';
import {
  getMainCarrier,
  SentrySpan,
  setCurrentClient,
  spanToJSON,
  startInactiveSpan,
  TRACING_DEFAULTS,
  updateSpanName,
  withActiveSpan,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as performanceObserver from '../../src/instrumentation/performanceObserver';
import { interactionsIntegration } from '../../src/performance/interactions';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

describe('interactionsIntegration', () => {
  let client: TestClient;
  let endedSpans: Span[];
  let clickListener: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    getMainCarrier().__SENTRY__ = undefined;

    client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    endedSpans = [];
    client.on('spanEnd', span => {
      endedSpans.push(span);
    });

    // The integration attaches a global click listener that it never removes, so intercept the
    // registration instead of dispatching real events - otherwise listeners leak between tests.
    clickListener = undefined;
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'click') {
        clickListener = listener as () => void;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Runs a full pageload/navigation span through the client hooks the integration listens on. */
  function completeRouteSpan(span: SentrySpan): void {
    client.emit('spanStart', span);
    span.end();
  }

  function click(): void {
    clickListener?.();
  }

  /** Lets the idle span of an interaction time out so it shows up in `endedSpans`. */
  function flushIdleSpan(): void {
    vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);
  }

  function getInteractionSpans(): Span[] {
    return endedSpans.filter(span => spanToJSON(span).attributes['sentry.op'] === 'ui.action.click');
  }

  it('listens for clicks in the capture phase', () => {
    interactionsIntegration().setup?.(client);

    expect(window.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });
  });

  it('starts an interaction span named after the last route', () => {
    interactionsIntegration().setup?.(client);
    completeRouteSpan(new SentrySpan({ op: 'pageload', name: '/users/:id', sampled: true }));

    click();
    flushIdleSpan();

    const spans = getInteractionSpans();
    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!).name).toBe('/users/:id');
  });

  it('inherits the source of the route span', () => {
    interactionsIntegration().setup?.(client);
    completeRouteSpan(
      new SentrySpan({
        op: 'navigation',
        name: '/users/:id',
        sampled: true,
        attributes: { 'sentry.source': 'route' },
      }),
    );

    click();
    flushIdleSpan();

    expect(spanToJSON(getInteractionSpans()[0]!).attributes).toMatchObject({ 'sentry.source': 'route' });
  });

  it('falls back to a url source when the route span has none', () => {
    interactionsIntegration().setup?.(client);
    completeRouteSpan(new SentrySpan({ op: 'pageload', name: '/users/1', sampled: true }));

    click();
    flushIdleSpan();

    expect(spanToJSON(getInteractionSpans()[0]!).attributes).toMatchObject({ 'sentry.source': 'url' });
  });

  it('picks up the route name a router set after the route span started', () => {
    interactionsIntegration().setup?.(client);

    const pageloadSpan = new SentrySpan({ op: 'pageload', name: '/users/1', sampled: true });
    client.emit('spanStart', pageloadSpan);
    updateSpanName(pageloadSpan, '/users/:id');
    pageloadSpan.end();

    click();
    flushIdleSpan();

    expect(spanToJSON(getInteractionSpans()[0]!).name).toBe('/users/:id');
  });

  it('does not start an interaction span before any route span was seen', () => {
    interactionsIntegration().setup?.(client);

    click();
    flushIdleSpan();

    expect(getInteractionSpans()).toHaveLength(0);
  });

  it('does not start an interaction span while a route span is in progress', () => {
    interactionsIntegration().setup?.(client);
    completeRouteSpan(new SentrySpan({ op: 'pageload', name: '/', sampled: true }));

    client.emit('spanStart', new SentrySpan({ op: 'navigation', name: '/users', sampled: true }));
    click();
    flushIdleSpan();

    expect(getInteractionSpans()).toHaveLength(0);
  });

  it('ignores child spans and spans with unrelated ops', () => {
    interactionsIntegration().setup?.(client);

    const rootSpan = startInactiveSpan({ op: 'function', name: 'render' });
    withActiveSpan(rootSpan, () => {
      startInactiveSpan({ op: 'navigation', name: '/child' }).end();
    });
    rootSpan.end();
    startInactiveSpan({ op: 'navigation.redirect', name: '/redirect' }).end();

    click();
    flushIdleSpan();

    expect(getInteractionSpans()).toHaveLength(0);
  });

  it('interrupts a still running interaction span when the next click happens', () => {
    interactionsIntegration().setup?.(client);
    completeRouteSpan(new SentrySpan({ op: 'pageload', name: '/', sampled: true }));

    click();
    click();
    flushIdleSpan();

    const spans = getInteractionSpans();
    expect(spans).toHaveLength(2);
    expect(spanToJSON(spans[0]!).attributes).toMatchObject({
      'sentry.idle_span_finish_reason': 'interactionInterrupted',
    });
    expect(spanToJSON(spans[1]!).attributes).toMatchObject({ 'sentry.idle_span_finish_reason': 'idleTimeout' });
  });

  it('honors custom idle span timeouts', () => {
    interactionsIntegration({ idleTimeout: 5000 }).setup?.(client);
    completeRouteSpan(new SentrySpan({ op: 'pageload', name: '/', sampled: true }));

    click();
    vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);
    expect(getInteractionSpans()).toHaveLength(0);

    vi.advanceTimersByTime(5000);
    expect(getInteractionSpans()).toHaveLength(1);
  });

  it('records browser event timing entries for clicks as spans on the active span', () => {
    let handler: ((data: { entries: PerformanceEntry[] }) => void) | undefined;
    vi.spyOn(performanceObserver, 'addPerformanceInstrumentationHandler').mockImplementation((type, callback) => {
      if (type === 'event') {
        handler = callback as typeof handler;
      }
      return () => undefined;
    });

    interactionsIntegration().setup?.(client);
    completeRouteSpan(new SentrySpan({ op: 'pageload', name: '/', sampled: true }));
    click();

    handler?.({
      entries: [
        {
          name: 'click',
          entryType: 'event',
          startTime: 100,
          duration: 50,
          target: document.body,
        } as unknown as PerformanceEntry,
      ],
    });
    flushIdleSpan();

    const eventSpans = endedSpans.filter(span => spanToJSON(span).attributes['sentry.op'] === 'ui.interaction.click');
    expect(eventSpans).toHaveLength(1);
    expect(spanToJSON(eventSpans[0]!).attributes).toMatchObject({ 'sentry.origin': 'auto.ui.browser.metrics' });
  });
});
