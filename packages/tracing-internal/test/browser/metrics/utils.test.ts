import { Span, Transaction } from '../../../src';
import { _startChild } from '../../../src/browser/metrics/utils';

describe('_startChild()', () => {
  it('creates a span with given properties', () => {
    const transaction = new Transaction({ name: 'test' });
    const span = _startChild(transaction, {
      description: 'evaluation',
      op: 'script',
    });

    expect(span).toBeInstanceOf(Span);
    expect(span.description).toBe('evaluation');
    expect(span.op).toBe('script');
  });

  it('adjusts the start timestamp if child span starts before transaction', () => {
    const transaction = new Transaction({ name: 'test', startTimestamp: 123 });
    const span = _startChild(transaction, {
      description: 'script.js',
      op: 'resource',
      startTimestamp: 100,
    });

    expect(transaction.startTimestamp).toEqual(span.startTimestamp);
    expect(transaction.startTimestamp).toEqual(100);
  });

  it('does not adjust start timestamp if child span starts after transaction', () => {
    const transaction = new Transaction({ name: 'test', startTimestamp: 123 });
    const span = _startChild(transaction, {
      description: 'script.js',
      op: 'resource',
      startTimestamp: 150,
    });

    expect(transaction.startTimestamp).not.toEqual(span.startTimestamp);
    expect(transaction.startTimestamp).toEqual(123);
  });
});
