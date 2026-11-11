import { SENTRY_OP } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { getMainCarrier, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resourcesIntegration } from '../../src/performance/resources';
import { WINDOW } from '../../src/types';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

describe('resourcesIntegration', () => {
  let client: TestClient;
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1, integrations: [resourcesIntegration()] }));
    setCurrentClient(client);
    client.init();

    endedSpans = [];
    client.on('spanEnd', span => void endedSpans.push(span));

    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('location', { origin: 'https://example.com' });
    vi.spyOn(WINDOW.performance, 'getEntries').mockReturnValue([
      {
        entryType: 'resource',
        name: 'https://example.com/app.js',
        initiatorType: 'script',
        startTime: 100,
        duration: 50,
        responseEnd: 150,
        toJSON: () => ({}),
      } as PerformanceResourceTiming,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['adds resource spans to pageload spans', 'pageload', 1],
    ['adds resource spans to navigation spans', 'navigation', 1],
    ['skips interaction idle spans', 'ui.action.click', 0],
  ])('%s', (_name, op, count) => {
    const span = new SentrySpan({ op, name: '/', sampled: true, startTimestamp: 1 });

    client.emit('beforeIdleSpanEnd', span);

    expect(
      endedSpans.map(s => spanToJSON(s).attributes?.[SENTRY_OP]).filter(o => o === 'resource.script'),
    ).toHaveLength(count);
  });
});
