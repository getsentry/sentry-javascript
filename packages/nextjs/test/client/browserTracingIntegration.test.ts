// @vitest-environment jsdom
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { NAVIGATION, PAGELOAD } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  createTransport,
  getActiveSpan,
  getCurrentScope,
  resolvedSyncPromise,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import { BrowserClient, startBrowserTracingNavigationSpan } from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserTracingIntegration } from '../../src/client/browserTracingIntegration';

describe('browserTracingIntegration', () => {
  const originalReadyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');

  beforeEach(() => {
    window.history.replaceState({}, '', '/products');
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    vi.stubEnv('_sentryCacheComponents', 'true');
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    // @ts-expect-error deleting the instance override restores the prototype getter
    delete document.readyState;
    if (originalReadyState) {
      Object.defineProperty(Document.prototype, 'readyState', originalReadyState);
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('ends a pageload that waits for its trace meta tag when a navigation starts, and keeps the navigation', () => {
    const client = new BrowserClient({
      dsn: 'http://examplePublicKey@localhost/0',
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
      stackParser: () => [],
      tracesSampleRate: 1,
      integrations: [browserTracingIntegration({ instrumentNavigation: false })],
    });
    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    setCurrentClient(client);
    client.init();

    const navigationSpan = startBrowserTracingNavigationSpan(client, { name: '/products/42' });

    expect(endedSpans).toHaveLength(1);
    expect(spanToJSON(endedSpans[0]!).attributes?.[SENTRY_OP]).toBe(PAGELOAD);
    expect(getActiveSpan()).toBe(navigationSpan);
    expect(navigationSpan!.isRecording()).toBe(true);
    expect(spanToJSON(navigationSpan!).attributes?.[SENTRY_OP]).toBe(NAVIGATION);
  });
});
