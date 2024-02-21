import { SentrySpan, Transaction, spanToJSON } from '@sentry/core';
import { _startChild } from '../../../src/browser/metrics/utils';

describe('_startChild()', () => {
  it('creates a span with given properties', () => {
    // eslint-disable-next-line deprecation/deprecation
    const transaction = new Transaction({ name: 'test' });
    const span = _startChild(transaction, {
      name: 'evaluation',
      op: 'script',
    });

    expect(span).toBeInstanceOf(SentrySpan);
    expect(spanToJSON(span).description).toBe('evaluation');
    expect(spanToJSON(span).op).toBe('script');
    expect(spanToJSON(span).op).toBe('script');
  });

  it('adjusts the start timestamp if child span starts before transaction', () => {
    // eslint-disable-next-line deprecation/deprecation
    const transaction = new Transaction({ name: 'test', startTimestamp: 123 });
    const span = _startChild(transaction, {
      name: 'script.js',
      op: 'resource',
      startTimestamp: 100,
    });

    expect(spanToJSON(transaction).start_timestamp).toEqual(spanToJSON(span).start_timestamp);
    expect(spanToJSON(transaction).start_timestamp).toEqual(100);
  });

  it('does not adjust start timestamp if child span starts after transaction', () => {
    // eslint-disable-next-line deprecation/deprecation
    const transaction = new Transaction({ name: 'test', startTimestamp: 123 });
    const span = _startChild(transaction, {
      name: 'script.js',
      op: 'resource',
      startTimestamp: 150,
    });

    expect(spanToJSON(transaction).start_timestamp).not.toEqual(spanToJSON(span).start_timestamp);
    expect(spanToJSON(transaction).start_timestamp).toEqual(123);
  });
});
