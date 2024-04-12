import { SentrySpan, getCurrentScope, getIsolationScope, setCurrentClient, spanToJSON } from '@sentry/core';
import { startAndEndSpan } from '../../src/metrics/utils';
import { TestClient, getDefaultClientOptions } from '../utils/TestClient';

describe('startAndEndSpan()', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
  });

  it('creates a span with given properties', () => {
    const parentSpan = new SentrySpan({ name: 'test', sampled: true });
    const span = startAndEndSpan(parentSpan, 100, 200, {
      name: 'evaluation',
      op: 'script',
    })!;

    expect(span).toBeDefined();
    expect(span).toBeInstanceOf(SentrySpan);
    expect(spanToJSON(span).description).toBe('evaluation');
    expect(spanToJSON(span).op).toBe('script');
    expect(spanToJSON(span).op).toBe('script');
  });

  it('adjusts the start timestamp if child span starts before transaction', () => {
    const parentSpan = new SentrySpan({ name: 'test', startTimestamp: 123, sampled: true });
    const span = startAndEndSpan(parentSpan, 100, 200, {
      name: 'script.js',
      op: 'resource',
    })!;

    expect(span).toBeDefined();
    expect(spanToJSON(parentSpan).start_timestamp).toEqual(spanToJSON(span).start_timestamp);
    expect(spanToJSON(parentSpan).start_timestamp).toEqual(100);
  });

  it('does not adjust start timestamp if child span starts after transaction', () => {
    const parentSpan = new SentrySpan({ name: 'test', startTimestamp: 123, sampled: true });
    const span = startAndEndSpan(parentSpan, 150, 200, {
      name: 'script.js',
      op: 'resource',
    })!;

    expect(span).toBeDefined();
    expect(spanToJSON(parentSpan).start_timestamp).not.toEqual(spanToJSON(span).start_timestamp);
    expect(spanToJSON(parentSpan).start_timestamp).toEqual(123);
  });
});
